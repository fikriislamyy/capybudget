<script lang="ts">
  import { goto } from '$app/navigation';
  import { getContext,onMount } from 'svelte';
  import * as Card from '$lib/components/ui/card';
  import * as Field from '$lib/components/ui/field';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { authClient } from '$lib/auth-client';
  import { createAuthCooldown } from '$lib/auth-rate-limit.svelte';
  import { AUTH_UI_CONTEXT, messages, type AuthUiState } from '$lib/i18n/auth';
  const authUi = getContext<AuthUiState>(AUTH_UI_CONTEXT);
  const t = $derived(messages[authUi.locale]);
  const cooldown = createAuthCooldown();
  let mounted=$state(false);onMount(()=>{mounted=true;});
  let email = $state(''); let password = $state(''); let busy = $state(false); let error = $state('');
  const errorMessage = $derived(error === 'rate-limited' ? (cooldown.seconds > 0 ? t.rateLimited.replace('{seconds}', String(cooldown.seconds)) : t.genericError) : error);
  async function submit(event: SubmitEvent) {
    event.preventDefault(); if (busy) return; busy = true; error = '';
    try {
      const result = await authClient.signIn.email({ email: email.trim(), password, callbackURL: '/dashboard' });
      if (result.error) throw new Error(result.error.message ?? t.genericError);
      if (result.data && 'twoFactorRedirect' in result.data && result.data.twoFactorRedirect) return;
      await goto('/dashboard', { invalidateAll: true });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '';
      error = /verify|verified/i.test(message) ? t.unverified : cooldown.seconds > 0 ? 'rate-limited' : t.genericError;
    } finally { busy = false; }
  }
</script>
<Card.Root class="auth-card"><Card.Header><Card.Title>{t.loginTitle}</Card.Title><Card.Description>{t.loginDescription}</Card.Description></Card.Header>
  <Card.Content><form onsubmit={submit}><Field.FieldGroup>
    <Field.Field><Field.FieldLabel for="email">{t.email}</Field.FieldLabel><Input id="email" type="email" autocomplete="email" bind:value={email} required maxlength={254} /></Field.Field>
    <Field.Field><div class="label-row"><Field.FieldLabel for="password">{t.password}</Field.FieldLabel><a href="/forgot-password">{t.forgot}</a></div><Input id="password" type="password" autocomplete="current-password" bind:value={password} required maxlength={128} /></Field.Field>
    {#if errorMessage}<p class="error" role="alert">{errorMessage} {#if error === t.unverified}<a href="/verify-email">{t.verify}</a>{/if}</p>{/if}
    <Button type="submit" class="submit" disabled={!mounted || busy || cooldown.seconds > 0}>{busy ? '…' : cooldown.seconds > 0 ? t.rateLimited.replace('{seconds}', String(cooldown.seconds)) : t.login}</Button>
  </Field.FieldGroup></form></Card.Content><Card.Footer class="card-footer"><span>{t.noAccount}</span><a href="/sign-up">{t.createAccount}</a></Card.Footer>
</Card.Root>
<style>:global(.auth-card){width:100%;border-color:#e9ece8;box-shadow:0 18px 55px #24392a0d;border-radius:18px}:global(.auth-card) :global([data-slot=card-header]){padding:26px 26px 18px}:global(.auth-card) :global([data-slot=card-title]){font-family:'Fredoka Variable',sans-serif;font-size:25px;font-weight:500}:global(.auth-card) :global([data-slot=card-description]){margin-top:5px}:global(.auth-card) :global([data-slot=card-content]){padding:0 26px 24px}:global(.auth-card) :global([data-slot=card-footer]){padding:16px 26px;border-top:1px solid #eff1ee;justify-content:center;gap:6px;font-size:13px;color:#77827a}.label-row{display:flex;justify-content:space-between;align-items:center}.label-row a,:global(.card-footer a),.error a{color:#498361;font-size:12px;font-weight:700;text-decoration:none}:global(.submit){width:100%;height:44px;background:#4d8966;color:white;border-radius:10px}:global(.submit):hover{background:#3e7655}.error{color:#a63434;font-size:13px;margin:0}:global(.card-footer a){text-decoration:none}</style>
