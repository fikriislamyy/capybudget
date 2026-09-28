import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { openapi } from '@elysiajs/openapi';
import { auth } from './auth';
import { guardAuthRequest } from './auth/rate-limit';
import { trackingRoutes } from './tracking/routes';

const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:5173';
const trustedProxyIps = new Set((process.env.TRUSTED_PROXY_IPS ?? '').split(',').map((ip) => ip.trim()).filter(Boolean));
const trustedProxyHops = Number(process.env.TRUSTED_PROXY_HOPS ?? 1);

export function clientIpForRequest(request: Request, socketIp: string | undefined): string {
  if (socketIp && trustedProxyIps.has(socketIp)) {
    const forwarded = request.headers.get('x-forwarded-for');
    const chain = forwarded?.split(',').map((part) => part.trim()).filter(Boolean) ?? [];
    if (chain.length && Number.isInteger(trustedProxyHops) && trustedProxyHops > 0) {
      return chain[Math.max(0, chain.length - trustedProxyHops)];
    }
  }
  return socketIp ?? 'unknown';
}

export const app = new Elysia()
  .use(cors({ origin: webOrigin, credentials: true }))
  .use(openapi())
  .use(trackingRoutes)
  .all('/api/auth/*', async ({ request, server }) => {
    const ip = clientIpForRequest(request, server?.requestIP(request)?.address);
    const limited = await guardAuthRequest(request, ip);
    if (limited) return limited;
    const trustedRequest = new Request(request, { headers: new Headers(request.headers) });
    trustedRequest.headers.set('x-forwarded-for', ip);
    return auth.handler(trustedRequest);
  })
  .get('/api/me', async ({ request }) => {
    const current = await auth.api.getSession({ headers: request.headers });
    if (!current) {
      return Response.json({ message: 'Authentication required.' }, {
        status: 401,
        headers: { 'Cache-Control': 'no-store' }
      });
    }
    if (!current.user.emailVerified) {
      return Response.json({ message: 'Email verification required.' }, {
        status: 403,
        headers: { 'Cache-Control': 'no-store' }
      });
    }
    return Response.json({
      user: {
        id: current.user.id,
        name: current.user.name,
        email: current.user.email,
        emailVerified: current.user.emailVerified
      }
    }, { headers: { 'Cache-Control': 'no-store' } });
  }, {
    detail: { summary: 'Current verified user', tags: ['System'] }
  })
  .get('/api/health', () => ({ status: 'ok' }), {
    detail: { summary: 'Health check', tags: ['System'] }
  })
  .get('/api', () => ({ name: 'CapyBudget API', version: '0.1.0' }));
