import { createAuthClient } from 'better-auth/svelte';
import { emailOTPClient } from 'better-auth/client/plugins';
import { env } from '$env/dynamic/public';

export const authClient = createAuthClient({
  baseURL: env.PUBLIC_APP_URL || 'http://localhost:5173',
  fetchOptions: {
    credentials: 'include',
    customFetchImpl: async (input, init) => {
      const response = await fetch(input, init);
      if (response.status === 429 && typeof window !== 'undefined') {
        const seconds = Number(response.headers.get('Retry-After')) || 60;
        window.dispatchEvent(new CustomEvent('capybudget:rate-limit', { detail: { seconds } }));
      }
      return response;
    }
  },
  plugins: [emailOTPClient()]
});
