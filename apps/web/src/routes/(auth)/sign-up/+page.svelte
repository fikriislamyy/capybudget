<script lang="ts">
  import PasswordChecklist from '$lib/components/forms/password-checklist.svelte';
  import { meetsPasswordPolicy } from '$lib/password-policy';
  import PasswordInput from '$lib/components/forms/password-input.svelte';
  import LoadingScope from '$lib/components/shared/loading-scope.svelte';
  import { goto } from '$app/navigation'; import { getContext } from 'svelte';
  import * as Card from '$lib/components/ui/card'; import * as Field from '$lib/components/ui/field';
  import { Button } from '$lib/components/ui/button'; import { Input } from '$lib/components/ui/input';
  import { authClient } from '$lib/auth-client'; import { createAuthCooldown } from '$lib/auth-rate-limit.svelte'; import { AUTH_UI_CONTEXT, messages, type AuthUiState } from '$lib/i18n/auth';
  const authUi = getContext<AuthUiState>(AUTH_UI_CONTEXT); const t = $derived(messages[authUi.locale]);
  const cooldown = createAuthCooldown();
  let name = $state(''); let email = $state(''); let password = $state(''); let confirmation = $state(''); let busy = $state(false); let error = $state('');
  const errorMessage = $derived(error === 'rate-limited' ? (cooldown.seconds > 0 ? t.rateLimited.replace('{seconds}', String(cooldown.seconds)) : t.genericError) : error);
  async function submit(event: SubmitEvent) {
    event.preventDefault(); error = '';
    if (!meetsPasswordPolicy(password)) { error = t.passwordRequirements; document.getElementById('password')?.focus(); return; }
    if (password !== confirmation) { error = t.passwordMismatch; return; }
    if (busy) return; busy = true;
    try {
      const result = await authClient.signUp.email({ name: name.trim(), email: email.trim(), password, callbackURL: '/verify-email' });
      if (result.error) throw new Error(result.error.message ?? t.genericError);
      sessionStorage.setItem('capybudget-pending-email', email.trim());
      await goto('/verify-email');
    } catch { error = cooldown.seconds > 0 ? 'rate-limited' : t.genericError; } finally { busy = false; }
  }
</script>
<LoadingScope active={!!busy} />
<Card.Root class="auth-card"><Card.Header><Card.Title role="heading" aria-level={1}>{t.signupTitle}</Card.Title><Card.Description>{t.signupDescription}</Card.Description></Card.Header><Card.Content>
  <form onsubmit={submit}><Field.FieldGroup>
    <Field.Field><Field.FieldLabel for="name">{t.name}</Field.FieldLabel><Input id="name" autocomplete="name" bind:value={name} required maxlength={100} /></Field.Field>
    <Field.Field><Field.FieldLabel for="email">{t.email}</Field.FieldLabel><Input id="email" type="email" autocomplete="email" bind:value={email} required maxlength={254} /></Field.Field>
    <Field.Field><Field.FieldLabel for="password">{t.password}</Field.FieldLabel><PasswordInput id="password"  autocomplete="new-password" bind:value={password} required minlength={12} maxlength={128} aria-describedby="password-requirements" />
      <PasswordChecklist {password} id="password-requirements" /></Field.Field>
    <Field.Field><Field.FieldLabel for="confirm">{t.confirmPassword}</Field.FieldLabel><PasswordInput id="confirm"  autocomplete="new-password" bind:value={confirmation} required minlength={12} maxlength={128} /></Field.Field>
    {#if errorMessage}<p class="error" role="alert">{errorMessage}</p>{/if}<Button type="submit" class="submit" disabled={busy || cooldown.seconds > 0}>{busy ? '…' : cooldown.seconds > 0 ? t.rateLimited.replace('{seconds}', String(cooldown.seconds)) : t.signup}</Button>
  </Field.FieldGroup></form>
</Card.Content><Card.Footer>{t.haveAccount}<a href="/login">{t.signIn}</a></Card.Footer></Card.Root>
<style>:global(.auth-card){width:100%;border-color:var(--border);box-shadow:var(--shadow-raised);border-radius:20px}:global(.auth-card) :global([data-slot=card-header]){padding:24px 24px 16px}:global(.auth-card) :global([data-slot=card-title]){font-family:var(--font-heading);font-size:25px;font-weight:500}:global(.auth-card) :global([data-slot=card-content]){padding:0 24px 24px}:global(.auth-card) :global([data-slot=card-footer]){padding:16px 24px;border-top:1px solid var(--border);justify-content:center;gap:6px;font-size:13px;color:var(--muted-foreground)}:global(.auth-card) :global([data-slot=card-footer] a){color:var(--brand-ink);font-weight:700;text-decoration:none}:global(.submit){width:100%;height:44px;background:var(--primary);color:var(--primary-foreground);border-radius:999px}.error{color:var(--destructive);font-size:13px;margin:0}</style>
