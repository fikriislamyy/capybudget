import { error, redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { parseOnboardingState, type OnboardingState } from '$lib/onboarding';

const apiOrigin = process.env.API_INTERNAL_URL ?? 'http://localhost:3000';

export const load: LayoutServerLoad = async ({ locals, request, url, setHeaders }) => {
  if (!locals.user) redirect(303, '/login');
  // Reading pathname makes SvelteKit re-run this guard during app navigation,
  // even when the parent layout is reused and a page has no server loader.
  const onWizard = url.pathname === '/onboarding';
  let completed: boolean;
  let status: number;
  let onboarding: OnboardingState | undefined;
  try {
    const cookie = request.headers.get('cookie');
    const response = await fetch(`${apiOrigin}/api/onboarding`, {
      headers: cookie ? { cookie } : {},
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
    });
    status = response.status;
    if (status === 401 || status === 403 || status === 423) {
      completed = false;
    } else {
      if (!response.ok) throw new Error('Onboarding service unavailable');
      onboarding = parseOnboardingState(await response.json());
      completed = onboarding.completed;
    }
  } catch {
    setHeaders({ 'Cache-Control': 'no-store', 'Retry-After': '5' });
    error(503, 'Unable to check your onboarding progress. Please try again.');
  }
  if (status === 401) redirect(303, '/login');
  if (status === 403) redirect(303, '/verify-email');
  if (status === 423) redirect(303, '/unlock');
  if (!completed && !onWizard) redirect(303, '/onboarding');
  if (completed && onWizard) redirect(303, '/dashboard');
  return { user: locals.user, onboardingCompleted: completed, appPath: url.pathname, onboarding: onboarding! };
};
