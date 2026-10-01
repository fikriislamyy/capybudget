import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { openapi } from '@elysiajs/openapi';
import { auth } from './auth';
import { securityGuard, securityActor, consumeGrant, SecurityError } from './security/guards';
import { privacyRoutes } from './privacy/routes';
import { securityRoutes } from './security/routes';
import { guardAuthRequest } from './auth/rate-limit';
import { trackingRoutes } from './tracking/routes';
import { personalFinanceRoutes } from './personal-finance/routes';
import { businessRoutes } from './business/routes';
import { assistantRoutes } from './assistant/routes';
import { reportsRoutes } from './reports/routes';
import { notificationRoutes } from './notifications/routes';
import { uxRoutes } from './ux/routes';

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
  .onAfterHandle({as:'global'},({set,request})=>{if(new URL(request.url).pathname.startsWith('/api/')){set.headers['Cache-Control']='no-store';set.headers['X-Content-Type-Options']='nosniff';}})
  .onBeforeHandle({ as: 'global' }, ({request,server}) => {request.headers.set('x-capybudget-trusted-ip',clientIpForRequest(request,server?.requestIP(request)?.address));return securityGuard(request);})
  .use(securityRoutes)
  .use(privacyRoutes)
  .use(trackingRoutes)
  .use(notificationRoutes)
  .use(uxRoutes)
  .use(personalFinanceRoutes)
  .use(businessRoutes)
  .use(assistantRoutes)
  .use(reportsRoutes)
  .all('/api/auth/*', async ({ request, server }) => {
    const ip = clientIpForRequest(request, server?.requestIP(request)?.address);
    const limited = await guardAuthRequest(request, ip);
    if (limited) return limited;
    const path=new URL(request.url).pathname;
    try {
      const sensitive=new Set(['/api/auth/two-factor/enable','/api/auth/two-factor/disable','/api/auth/two-factor/generate-backup-codes','/api/auth/two-factor/get-totp-uri']);
      if(sensitive.has(path)) await consumeGrant(request,'factor');
      if(!['/api/auth/get-session','/api/auth/sign-out'].includes(path)) {
        const current=await auth.api.getSession({headers:request.headers});
        if(current?.user.emailVerified){const actor=await securityActor(request);if(actor.locked)throw new SecurityError(423,'Unlock this browser first.');}
      }
    }catch(error){if(error instanceof SecurityError)return Response.json({message:error.message},{status:error.status});throw error;}
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
