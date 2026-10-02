<script lang="ts">
  import LoadingScope from '$lib/components/shared/loading-scope.svelte';
  import { getContext } from 'svelte'; import { env } from '$env/dynamic/public'; import * as Card from '$lib/components/ui/card'; import * as Field from '$lib/components/ui/field';
  import { Button } from '$lib/components/ui/button'; import { Input } from '$lib/components/ui/input'; import { authClient } from '$lib/auth-client'; import { createAuthCooldown } from '$lib/auth-rate-limit.svelte'; import { AUTH_UI_CONTEXT, messages, type AuthUiState } from '$lib/i18n/auth';
  const authUi = getContext<AuthUiState>(AUTH_UI_CONTEXT); const t = $derived(messages[authUi.locale]);
  const cooldown = createAuthCooldown();
  let email = $state(''); let busy = $state(false); let error = $state(''); let sent = $state(false);
  const errorMessage = $derived(error === 'rate-limited' ? (cooldown.seconds > 0 ? t.rateLimited.replace('{seconds}', String(cooldown.seconds)) : t.genericError) : error);
  async function submit(event: SubmitEvent) {
    event.preventDefault(); if (busy) return; busy = true; error = '';
    try {
      const result = await authClient.requestPasswordReset({ email: email.trim(), redirectTo: `${env.PUBLIC_APP_URL || 'http://localhost:5173'}/reset-password` });
      if (result.error) throw new Error(); sent = true;
    } catch { error = cooldown.seconds > 0 ? 'rate-limited' : t.genericError; } finally { busy = false; }
  }
</script>
<LoadingScope active={!!busy} />
<Card.Root class="auth-card"><Card.Header><Card.Title role="heading" aria-level={1}>{t.forgotTitle}</Card.Title><Card.Description>{t.forgotDescription}</Card.Description></Card.Header><Card.Content>
  {#if sent}<p class="notice" role="status">{t.sent}</p>{:else}<form onsubmit={submit}><Field.FieldGroup><Field.Field><Field.FieldLabel for="email">{t.email}</Field.FieldLabel><Input id="email" type="email" autocomplete="email" bind:value={email} required maxlength={254} /></Field.Field>
  {#if errorMessage}<p class="error" role="alert">{errorMessage}</p>{/if}<Button type="submit" class="submit" disabled={busy || cooldown.seconds > 0}>{busy ? '…' : cooldown.seconds > 0 ? t.rateLimited.replace('{seconds}', String(cooldown.seconds)) : t.sendLink}</Button></Field.FieldGroup></form>{/if}
</Card.Content><Card.Footer><a href="/login">{t.backLogin}</a></Card.Footer></Card.Root>
<style>:global(.auth-card){width:100%;border-color:var(--border);box-shadow:var(--shadow-raised);border-radius:20px}:global(.auth-card) :global([data-slot=card-header]){padding:26px 26px 18px}:global(.auth-card) :global([data-slot=card-title]){font-family:var(--font-heading);font-size:25px;font-weight:500}:global(.auth-card) :global([data-slot=card-content]){padding:0 24px 24px}:global(.auth-card) :global([data-slot=card-footer]){padding:16px 24px;border-top:1px solid var(--border);justify-content:center}:global(.auth-card) :global([data-slot=card-footer] a){color:var(--brand-ink);font-size:13px;font-weight:700;text-decoration:none}:global(.submit){width:100%;height:44px;background:var(--primary);color:var(--primary-foreground);border-radius:999px}.error{color:var(--destructive);font-size:13px}.notice{color:var(--income-ink);font-size:14px;line-height:1.6}</style>
