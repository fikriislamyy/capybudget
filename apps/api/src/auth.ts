import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { emailOTP } from 'better-auth/plugins';
import { enqueueEmail } from './email/queue';
import type { EmailLocale } from './email/types';
import { db } from './db';
import { user, session, authAccount, verification } from './db/schema';

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
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: { user, session, account: authAccount, verification }
  }),
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
