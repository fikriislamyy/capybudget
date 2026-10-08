import { reportScheduleRoutes } from './reports/schedules';
import { businessAccountingRoutes } from './business/accounting-routes';
import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { openapi } from '@elysiajs/openapi';
import { auth } from './auth';
import { securityGuard, securityActor, consumeGrant, SecurityError } from './security/guards';
import { privacyRoutes } from './privacy/routes';
import { securityRoutes } from './security/routes';
import { guardAuthRequest } from './auth/rate-limit';
import { trackingRoutes } from './tracking/routes';
import { trackingV2Routes } from './tracking/v2/routes';
import { subscriptionRoutes } from './personal-finance/v2/subscriptions';
import { netWorthRoutes } from './personal-finance/v2/net-worth';
import { debtRoutes } from './personal-finance/v2/debts';
import { budgetMethodRoutes } from './personal-finance/v2/budgets';
import { personalFinanceRoutes } from './personal-finance/routes';
import { businessTaxRoutes } from './business/tax-routes';
import { paymentAdjustmentRoutes } from './business/payment-adjustments';
import { payableRoutes } from './business/payables';
import { businessAnalyticsRoutes } from './business/analytics';
import { recurringInvoiceRoutes } from './business/recurring';
import { businessPaymentRoutes } from './business/payments';
import { businessDirectoryRoutes } from './business/directory';
import { businessTeamRoutes } from './business/team';
import { businessRoutes } from './business/routes';
import { assistantV2Routes } from './assistant/v2/routes';
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
  .use(trackingV2Routes)
  .use(notificationRoutes)
  .use(uxRoutes)
  .use(personalFinanceRoutes)
  .use(budgetMethodRoutes)
  .use(debtRoutes)
  .use(subscriptionRoutes)
  .use(netWorthRoutes)
  .use(businessRoutes)
  .use(businessTaxRoutes)
  .use(businessTeamRoutes)
  .use(businessAccountingRoutes)
  .use(businessDirectoryRoutes)
  .use(businessPaymentRoutes)
  .use(recurringInvoiceRoutes)
  .use(payableRoutes)
  .use(businessAnalyticsRoutes)
  .use(paymentAdjustmentRoutes)
  .use(assistantRoutes)
  .use(assistantV2Routes)
  .use(reportsRoutes)
  .use(reportScheduleRoutes)
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
