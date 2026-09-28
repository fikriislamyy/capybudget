export function createAuthCooldown() {
  let seconds = $state(0);

  $effect(() => {
    const onRateLimit = (event: Event) => {
      const retryAfter = (event as CustomEvent<{ seconds: number }>).detail.seconds;
      seconds = Math.max(1, Math.ceil(retryAfter));
    };
    window.addEventListener('capybudget:rate-limit', onRateLimit);
    return () => window.removeEventListener('capybudget:rate-limit', onRateLimit);
  });

  $effect(() => {
    if (seconds <= 0) return;
    const timer = window.setTimeout(() => seconds = Math.max(0, seconds - 1), 1000);
    return () => window.clearTimeout(timer);
  });

  return { get seconds() { return seconds; } };
}
