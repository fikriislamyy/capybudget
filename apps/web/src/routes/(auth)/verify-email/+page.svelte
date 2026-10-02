<script lang="ts">
  import LoadingScope from '$lib/components/shared/loading-scope.svelte';
  import { goto } from '$app/navigation'; import { getContext } from 'svelte';
  import * as Card from '$lib/components/ui/card'; import * as Field from '$lib/components/ui/field';
  import * as OTP from '$lib/components/ui/input-otp'; import { Button } from '$lib/components/ui/button'; import { Input } from '$lib/components/ui/input';
  import { authClient } from '$lib/auth-client'; import { AUTH_UI_CONTEXT, messages, type AuthUiState } from '$lib/i18n/auth';
  const authUi = getContext<AuthUiState>(AUTH_UI_CONTEXT); const t = $derived(messages[authUi.locale]);
  let email = $state(''); let otp = $state(''); let busy = $state(false); let error = $state(''); let notice = $state(''); let cooldown = $state(0);
  const errorMessage = $derived(error === 'rate-limited' ? (cooldown > 0 ? t.rateLimited.replace('{seconds}', String(cooldown)) : t.genericError) : error);
  $effect(() => { email = sessionStorage.getItem('capybudget-pending-email') ?? ''; });
  $effect(() => {
    const onLimited = (event: Event) => {
      const seconds = (event as CustomEvent<{ seconds: number }>).detail.seconds;
      cooldown = Math.max(1, Math.ceil(seconds));
    };
    window.addEventListener('capybudget:rate-limit', onLimited);
    return () => window.removeEventListener('capybudget:rate-limit', onLimited);
  });
  $effect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => cooldown = Math.max(0, cooldown - 1), 1000);
    return () => window.clearTimeout(timer);
  });
  async function submit(event: SubmitEvent) {
    event.preventDefault(); if (busy) return; busy = true; error = ''; notice = '';
    try {
      const result = await authClient.emailOtp.verifyEmail({ email: email.trim(), otp });
      if (result.error) throw new Error();
      sessionStorage.removeItem('capybudget-pending-email'); notice = t.verified;
      await goto('/login?verified=1');
    } catch { error = cooldown > 0 ? 'rate-limited' : t.genericError; } finally { busy = false; }
  }
  async function resend() {
    if (!email || busy) return; busy = true; error = ''; notice = '';
    try {
      const result = await authClient.emailOtp.sendVerificationOtp({ email: email.trim(), type: 'email-verification' });
      if (result.error) throw new Error(); notice = t.verificationSent;
    } catch { error = cooldown > 0 ? 'rate-limited' : t.genericError; } finally { busy = false; }
  }
</script>
<LoadingScope active={!!busy} />
<Card.Root class="auth-card"><Card.Header><Card.Title role="heading" aria-level={1}>{t.verifyTitle}</Card.Title><Card.Description>{t.verifyDescription}</Card.Description></Card.Header><Card.Content>
  <form onsubmit={submit}><Field.FieldGroup>
    <Field.Field><Field.FieldLabel for="email">{t.email}</Field.FieldLabel><Input id="email" type="email" autocomplete="email" bind:value={email} required maxlength={254} /></Field.Field>
    <Field.Field><Field.FieldLabel for="otp">{t.code}</Field.FieldLabel><OTP.Root id="otp" bind:value={otp} maxlength={6} pattern="[0-9]*" inputmode="numeric" autocomplete="one-time-code" aria-label={t.code} class="otp">{#snippet children({ cells })}<OTP.Group>{#each cells as cell}<OTP.Slot {cell}/>{/each}</OTP.Group>{/snippet}</OTP.Root></Field.Field>
    {#if errorMessage}<p class="error" role="alert">{errorMessage}</p>{/if}{#if notice}<p class="notice" role="status">{notice}</p>{/if}
    <Button type="submit" class="submit" disabled={busy || otp.length !== 6}>{busy ? '…' : t.verify}</Button>
    <Button type="button" variant="outline" class="resend" disabled={busy || !email || cooldown > 0} onclick={resend}>{cooldown > 0 ? t.resendWait.replace('{seconds}', String(cooldown)) : t.resend}</Button>
  </Field.FieldGroup></form>
</Card.Content><Card.Footer><a href="/login">{t.backLogin}</a></Card.Footer></Card.Root>
<style>:global(.auth-card){width:100%;border-color:var(--border);box-shadow:var(--shadow-raised);border-radius:20px}:global(.auth-card) :global([data-slot=card-header]){padding:26px 26px 18px}:global(.auth-card) :global([data-slot=card-title]){font-family:var(--font-heading);font-size:25px;font-weight:500}:global(.auth-card) :global([data-slot=card-content]){padding:0 24px 24px}:global(.auth-card) :global([data-slot=card-footer]){padding:16px 24px;border-top:1px solid var(--border);justify-content:center}:global(.auth-card) :global([data-slot=card-footer] a){color:var(--brand-ink);font-size:13px;font-weight:700;text-decoration:none}:global(.otp){justify-content:center}:global(.submit),:global(.resend){width:100%;height:44px;border-radius:999px}:global(.submit){background:var(--primary);color:var(--primary-foreground)}.error{color:var(--destructive);font-size:13px;margin:0}.notice{color:var(--income-ink);font-size:13px;margin:0}</style>
