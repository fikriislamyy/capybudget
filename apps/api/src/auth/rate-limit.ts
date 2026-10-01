import { createHmac } from 'node:crypto';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: 1,
  retryStrategy: () => null
});
redis.on('error', () => {
  // Request handlers report an unavailable limiter without exposing Redis details.
});

type Bucket = { key: string; limit: number; seconds: number };
type RateDecision = { blocked: false } | { blocked: true; retryAfter: number };

const incrementScript = [
  'local retry = 0',
  'for i = 1, #KEYS do',
  '  local count = redis.call("INCR", KEYS[i])',
  '  if count == 1 then redis.call("EXPIRE", KEYS[i], tonumber(ARGV[(i - 1) * 2 + 1])) end',
  '  if count > tonumber(ARGV[(i - 1) * 2 + 2]) then',
  '    local ttl = redis.call("TTL", KEYS[i])',
  '    if ttl < 1 then ttl = 1 end',
  '    if ttl > retry then retry = ttl end',
  '  end',
  'end',
  'return retry'
].join('\n');

function digest(scope: string, value: string): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error('BETTER_AUTH_SECRET is required for auth rate limits');
  return createHmac('sha256', secret).update(scope).update('\0').update(value).digest('hex');
}

export function normalizeEmailForLimit(email: string): string | undefined {
  const normalized = email.trim().toLowerCase();
  if (!normalized || normalized.length > 320 || !normalized.includes('@')) return undefined;
  return normalized;
}

export function buildRateLimitBuckets(path: string, email: string | undefined, ip: string): Bucket[] {
  const buckets: Bucket[] = [
    { key: 'ip:all:' + digest('ip', ip), limit: 100, seconds: 60 }
  ];
  const emailKey = email ? 'email:' + digest('email', email) : undefined;
  const ipKey = digest('ip', ip);

  const addIp = (name: string, limit: number, seconds: number) => {
    buckets.push({ key: 'ip:' + name + ':' + ipKey, limit, seconds });
  };
  const addEmail = (name: string, limit: number, seconds: number) => {
    if (emailKey) buckets.push({ key: 'email:' + name + ':' + emailKey, limit, seconds });
  };

  if (path.startsWith('/two-factor/')) { addIp('second-factor', 20, 900); }
  else if (path === '/sign-up/email') {
    addIp('signup', 5, 900);
    addEmail('verification:window', 3, 900);
    addEmail('verification:cooldown', 1, 60);
  } else if (path === '/sign-in/email') {
    addIp('login', 20, 900);
    addEmail('login', 10, 900);
  } else if (path === '/email-otp/send-verification-otp') {
    addIp('email-send', 10, 900);
    addEmail('verification:window', 3, 900);
    addEmail('verification:cooldown', 1, 60);
  } else if (path === '/request-password-reset') {
    addIp('email-send', 10, 900);
    addEmail('password-reset:window', 3, 900);
    addEmail('password-reset:cooldown', 1, 60);
  } else if (path === '/email-otp/verify-email' || path === '/reset-password') {
    addIp('credential-change', 20, 900);
  }

  return buckets;
}

export async function consumeAuthRateLimit(buckets: Bucket[]): Promise<RateDecision> {
  if (buckets.length === 0) return { blocked: false };
  const keys = buckets.map(({ key }) => 'capybudget:auth:' + key);
  const args = buckets.flatMap(({ seconds, limit }) => [String(seconds), String(limit)]);
  const retryAfter = Number(await redis.eval(incrementScript, keys.length, ...keys, ...args));
  return retryAfter > 0 ? { blocked: true, retryAfter } : { blocked: false };
}

const disabledPaths = new Set([
  '/send-verification-email',
  '/sign-in/email-otp',
  '/email-otp/sign-in',
  '/email-otp/request-password-reset',
  '/forget-password/email-otp',
  '/email-otp/reset-password',
  '/email-otp/check-verification-otp',
  '/email-otp/get-verification-otp',
  '/email-otp/create-verification-otp',
  '/email-otp/request-email-change',
  '/email-otp/change-email'
]);

export async function guardAuthRequest(request: Request, clientIp: string): Promise<Response | undefined> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/auth/, '') || '/';
  if (disabledPaths.has(path)) return new Response('Not Found', { status: 404 });

  let email: string | undefined;
  if (request.method === 'POST' && (
    path === '/sign-up/email' ||
    path === '/sign-in/email' ||
    path === '/email-otp/send-verification-otp' ||
    path === '/email-otp/verify-email' ||
    path === '/request-password-reset'
  )) {
    try {
      const body = await request.clone().json() as { email?: unknown; type?: unknown };
      if (typeof body.email === 'string') email = normalizeEmailForLimit(body.email);
      if (path === '/email-otp/send-verification-otp' && body.type !== 'email-verification') {
        return new Response('Not Found', { status: 404 });
      }
    } catch {
      // Better Auth validates malformed JSON/body details itself.
    }
  }

  try {
    const decision = await consumeAuthRateLimit(buildRateLimitBuckets(path, email, clientIp));
    if (decision.blocked) {
      return Response.json(
        { message: 'Too many requests. Please wait before trying again.' },
        { status: 429, headers: { 'Retry-After': String(decision.retryAfter) } }
      );
    }
  } catch {
    return Response.json(
      { message: 'Authentication is temporarily unavailable. Please try again.' },
      { status: 503, headers: { 'Retry-After': '5' } }
    );
  }
  return undefined;
}
