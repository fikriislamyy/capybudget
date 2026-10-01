import { createAuthMiddleware, APIError } from 'better-auth/api';
import { client } from './db';
import { acceptFactorCode } from './security/factor';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { emailOTP, twoFactor } from 'better-auth/plugins';
import { enqueueEmail } from './email/queue';
import type { EmailLocale } from './email/types';
import { db } from './db';
import { user, session, authAccount, verification, twoFactor as twoFactorTable } from './db/schema';

const publicOrigin = process.env.BETTER_AUTH_URL ?? 'http://localhost:5173';
const isProduction = process.env.NODE_ENV === 'production';
const authSecret = process.env.BETTER_AUTH_SECRET;

if (!authSecret || authSecret.length < 32) {
  throw new Error('BETTER_AUTH_SECRET must be configured with at least 32 characters');
}

function emailLocale(acceptLanguage?: string): EmailLocale {
  return acceptLanguage?.toLowerCase().includes('id') ? 'id' : 'en';
}

function frontendResetUrl(authUrl: string): string {
  const generated = new URL(authUrl);
  const encodedToken = generated.pathname.split('/').filter(Boolean).at(-1);
  if (!encodedToken || !generated.pathname.includes('/reset-password/')) {
    throw new Error('Better Auth generated an invalid password reset URL');
  }
  const destination = new URL('/reset-password', publicOrigin);
  destination.searchParams.set('token', decodeURIComponent(encodedToken));
  return destination.toString();
}

export const auth = betterAuth({
  hooks: {
    before: createAuthMiddleware(async ctx => {
      if (ctx.path.startsWith('/two-factor/') && ctx.body?.trustDevice) throw new APIError('BAD_REQUEST',{message:'Trusted-device bypass is disabled.'});
      if (ctx.path === '/two-factor/send-otp' || ctx.path === '/two-factor/verify-otp') throw new APIError('NOT_FOUND',{message:'Use your authenticator or recovery code.'});
    }),
    after: createAuthMiddleware(async ctx => {
      const factorMutations=['/two-factor/disable','/two-factor/generate-backup-codes','/two-factor/verify-backup-code'];
      const changedEnrollment=ctx.path==='/two-factor/verify-totp' && ctx.context.session && ctx.context.newSession?.user.twoFactorEnabled && !ctx.context.session.user.twoFactorEnabled;
      if(factorMutations.includes(ctx.path)||changedEnrollment){
        const current=ctx.context.newSession??ctx.context.session;
        const returned=ctx.context.returned as {user?:{id:string}}|undefined;
        if(current && returned && !(returned instanceof Error)){
          await client`update "user" set security_version=security_version+1 where id=${current.user.id}`;
          await client`delete from session where user_id=${current.user.id} and id<>${current.session.id}`;
          await client`insert into security_events(user_id,action,outcome) values(${current.user.id},'factor.changed','allowed')`;
        }
      }
      if (ctx.path !== '/two-factor/verify-totp') return;
      const result = ctx.context.returned as {user?:{id:string},status?:boolean} | undefined;
      const identity = ctx.context.newSession ?? ctx.context.session;
      const userId = identity?.user.id ?? result?.user?.id;
      if (!userId || !result || (!result.user && result.status !== true)) return;
      if (!await acceptFactorCode(userId,ctx.body.code)) {
        if (ctx.context.newSession) await ctx.context.internalAdapter.deleteSession(ctx.context.newSession.session.token);
        throw new APIError('UNAUTHORIZED',{message:'This authenticator code was already used. Wait for the next code.'});
      }
    })
  },
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: { user, session, account: authAccount, verification, twoFactor: twoFactorTable }
  }),
  databaseHooks: {session:{create:{before:async data=>{
    const [owner]=await client`select account_status from "user" where id=${data.userId}`;
    if(!owner || owner.account_status!=='active') return false;
    return {data};
  }}}},
  account: {encryptOAuthTokens:true},
  baseURL: publicOrigin,
  trustedOrigins: [process.env.WEB_ORIGIN ?? publicOrigin],
  secret: authSecret,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    autoSignIn: false,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    resetPasswordTokenExpiresIn: 30 * 60,
    revokeSessionsOnPasswordReset: true,
    async sendResetPassword({ user: resetUser, url }, request) {
      await enqueueEmail({
        kind: 'password-reset',
        to: resetUser.email,
        url: frontendResetUrl(url),
        locale: emailLocale(request?.headers.get('accept-language') ?? undefined),
        expiresAt: Date.now() + 30 * 60 * 1000
      });
    }
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: false,
    autoSignInAfterVerification: false
  },
  session: {
    expiresIn: 7 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
    cookieCache: { enabled: false }
  },
  rateLimit: {
    enabled: true,
    storage: 'memory',
    window: 60,
    max: 100,
    customRules: {
      '/sign-up/email': { window: 900, max: 5 },
      '/sign-in/email': { window: 900, max: 20 },
      '/email-otp/send-verification-otp': { window: 900, max: 5 },
      '/email-otp/verify-email': { window: 900, max: 10 },
      '/request-password-reset': { window: 900, max: 5 },
      '/reset-password': { window: 900, max: 10 }
    }
  },
  advanced: {
    cookiePrefix: 'capybudget',
    ipAddress: { ipAddressHeaders: ['x-forwarded-for'] },
    defaultCookieAttributes: {
      sameSite: 'lax',
      secure: isProduction,
      httpOnly: true
    }
  },
  disabledPaths: [
    '/sign-in/email-otp',
    '/email-otp/sign-in',
    '/email-otp/request-password-reset',
    '/forget-password/email-otp',
    '/email-otp/reset-password',
    '/email-otp/check-verification-otp',
    '/email-otp/get-verification-otp',
    '/email-otp/create-verification-otp',
    '/email-otp/request-email-change',
    '/email-otp/change-email',
    '/send-verification-email'
  ],
  plugins: [
    twoFactor({ issuer: 'CapyBudget', skipVerificationOnEnable: false, backupCodeOptions: { storeBackupCodes: 'encrypted' } }),
    emailOTP({
      overrideDefaultEmailVerification: true,
      otpLength: 6,
      expiresIn: 10 * 60,
      allowedAttempts: 5,
      storeOTP: 'hashed',
      resendStrategy: 'rotate',
      async sendVerificationOTP({ email, otp, type }, context) {
        if (type !== 'email-verification') throw new Error('Unsupported verification email type');
        await enqueueEmail({
          kind: 'verification',
          to: email,
          otp,
          locale: emailLocale(context?.request?.headers.get('accept-language') ?? undefined),
          expiresAt: Date.now() + 10 * 60 * 1000
        });
      }
    })
  ]
});
