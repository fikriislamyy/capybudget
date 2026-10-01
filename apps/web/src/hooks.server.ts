import type { Handle } from '@sveltejs/kit';

const apiOrigin = process.env.API_INTERNAL_URL ?? 'http://localhost:3000';

export const handle: Handle = async ({ event, resolve }) => {
  event.locals.user = null;
  event.locals.sessionState = 'available';
  const path = event.url.pathname;
  const privateRoots = ['/dashboard','/transactions','/accounts','/categories','/recurring','/budgets','/goals','/bills','/notifications','/reports','/assistant','/invoices','/business','/settings','/onboarding'];
  const isPrivate = privateRoots.some((root) => path === root || path.startsWith(root + '/'));
  const isEntry = path === '/login' || path === '/sign-up';
  const cookie = event.request.headers.get('cookie');
  if (cookie || isPrivate || isEntry) {
    try {
      const response = await fetch(`${apiOrigin}/api/auth/get-session`, {
        headers: cookie ? { cookie } : {},
        cache: 'no-store',
        signal: AbortSignal.timeout(4000)
      });
      if (!response.ok) throw new Error(`Session endpoint returned ${response.status}`);
      const result = await response.json();
      if (result?.user) {
        event.locals.user = {
          id: result.user.id,
          name: result.user.name,
          email: result.user.email,
          emailVerified: Boolean(result.user.emailVerified)
        };
      }
    } catch {
      event.locals.sessionState = 'unavailable';
    }
  }

  if (event.locals.sessionState === 'unavailable' && (isPrivate || isEntry)) {
    return new Response('Authentication service is temporarily unavailable.', {
      status: 503,
      headers: { 'Cache-Control': 'no-store', 'Retry-After': '5' }
    });
  }
  if (isPrivate && !event.locals.user) {
    return Response.redirect(new URL('/login', event.url), 303);
  }
  if (isPrivate && event.locals.user && !event.locals.user.emailVerified) {
    return Response.redirect(new URL('/verify-email', event.url), 303);
  }
  if (isEntry && event.locals.user) {
    return Response.redirect(new URL('/dashboard', event.url), 303);
  }

  if ((isPrivate || path === '/unlock') && event.locals.user) {
    try {
      const status = await fetch(`${apiOrigin}/api/security/status`, {headers:cookie?{cookie}:{},cache:'no-store',signal:AbortSignal.timeout(4000)});
      if (!status.ok) return Response.redirect(new URL('/login',event.url),303);
      const security = await status.json();
      if (security.locked && path !== '/unlock') return Response.redirect(new URL('/unlock',event.url),303);
      if (!security.locked && path === '/unlock') return Response.redirect(new URL('/dashboard',event.url),303);
    } catch { return new Response('Security service is temporarily unavailable.',{status:503,headers:{'Cache-Control':'no-store'}}); }
  }
  const response = await resolve(event);
  if (isPrivate || path.startsWith('/api/') || ['/unlock','/two-factor','/reset-password','/deletion-receipt'].includes(path)) {
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('Referrer-Policy', 'no-referrer');
  }
  response.headers.set('X-Content-Type-Options','nosniff');
  response.headers.set('Content-Security-Policy',"frame-ancestors 'none'; object-src 'none'; base-uri 'self'");
  response.headers.set('Permissions-Policy','publickey-credentials-get=(self), publickey-credentials-create=(self)');
  return response;
};
