<script lang="ts">
  import { onMount, getContext } from 'svelte';
  import { goto } from '$app/navigation';
  import { invitationDestination, type InvitationFlow } from '$lib/invitation';
  import { authClient } from '$lib/auth-client';
  import { AUTH_UI_CONTEXT, type AuthUiState } from '$lib/i18n/auth';
  import * as Card from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import LoadingScope from '$lib/components/shared/loading-scope.svelte';
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
  const ui = getContext<AuthUiState>(AUTH_UI_CONTEXT);
  const copy = (en: string, id: string) => ui.locale === 'id' ? id : en;
  let flow = $state<InvitationFlow | null>(null), busy = $state(false), error = $state(''), token = '';
  $effect(() => { flow = data.invitation; });
  async function call(path: string, body?: unknown) {
    const response = await fetch('/api/business/invitations/' + path, {method:body === undefined ? 'GET' : 'POST',
      headers:body === undefined ? {} : {'content-type':'application/json'},...(body === undefined ? {} : {body:JSON.stringify(body)})});
    const result = await response.json();
    if (!response.ok) throw new Error(result.message ?? copy('Please try again.','Silakan coba lagi.'));
    return result;
  }
  async function open() {
    if (busy) return;
    busy = true; error = '';
    try {
      if (token) {
        await call('flow/start',{token});
        history.replaceState(history.state,'',window.location.pathname);
        token = '';
      }
      flow = await call('flow');
      if (flow?.stage === 'complete') {
        const result = await call('flow/finish',{});
        localStorage.setItem('capybudget-workspace:' + result.userId,result.workspaceId);
        await goto('/invoices',{invalidateAll:true});
      } else if (flow && invitationDestination(flow) !== '/join') await goto(invitationDestination(flow),{invalidateAll:true});
    } catch (cause) { error = cause instanceof Error ? cause.message : String(cause); }
    finally { busy = false; }
  }
  onMount(() => { token = window.location.hash.slice(1); if (token || data.invitation) void open(); });
  async function accept() {
    if (busy) return;
    busy = true; error = '';
    try {
      const result = await call('accept',{});
      localStorage.setItem('capybudget-workspace:' + result.userId,result.workspaceId);

      // The existing app layout still requires onboarding for new accounts.
      await goto(result.needsOnboarding ? '/onboarding' : '/invoices',{invalidateAll:true});
    } catch (cause) { error = cause instanceof Error ? cause.message : String(cause); }
    finally { busy = false; }
  }
  async function signOut() {
    busy = true; error = '';
    try { const result = await authClient.signOut(); if (result.error) throw new Error(result.error.message); busy = false; await open(); }
    catch (cause) { error = cause instanceof Error ? cause.message : String(cause); }
    finally { busy = false; }
  }
  async function leave() {
    busy = true; error = '';
    try { await call('flow/cancel',{}); await goto('/login',{invalidateAll:true}); }
    catch (cause) { error = cause instanceof Error ? cause.message : String(cause); }
    finally { busy = false; }
  }
</script>
<svelte:head><title>CapyBudget · {copy('Join your team','Bergabung ke tim')}</title></svelte:head>
<LoadingScope active={busy}/>
<Card.Root class="w-full rounded-[20px]">
  <Card.Header class="p-6"><Card.Title role="heading" aria-level={1}>{copy('A place for you on the team','Ada tempat untuk Anda di tim')}</Card.Title>
    <Card.Description>{flow?.businessName ?? copy('Open your invitation to get started.','Buka undangan Anda untuk memulai.')}</Card.Description></Card.Header>
  <Card.Content class="space-y-4 px-6 pb-6">
    {#if error}<p role="alert" class="text-sm text-destructive">{error}</p><Button variant="outline" disabled={busy} onclick={open}>{copy('Try again','Coba lagi')}</Button>{/if}
    {#if flow?.email}<p class="break-words text-sm">{flow.email} · {flow.role}</p>{/if}
    {#if flow?.stage === 'accept'}
      <p class="text-sm text-muted-foreground">{copy('Your email is verified. Accept to join this business workspace. Your personal finances stay separate.','Email Anda terverifikasi. Terima undangan untuk bergabung ke ruang bisnis ini. Keuangan pribadi tetap terpisah.')}</p>
      <Button class="w-full" disabled={busy} onclick={accept}>{copy('Accept invitation','Terima undangan')}</Button>
    {:else if flow?.stage === 'wrong-account'}
      <p class="text-sm">{copy('You’re signed in with a different email. Sign out to continue with the invited email.','Anda masuk dengan email berbeda. Keluar untuk melanjutkan dengan email yang diundang.')}</p>
      <Button class="w-full" disabled={busy} onclick={signOut}>{copy('Sign out and continue','Keluar dan lanjutkan')}</Button>
    {:else if !busy && (!flow || flow.stage === 'unavailable')}
      <p class="text-sm text-muted-foreground">{copy('This invitation is missing, expired, revoked, or already used. Ask the business owner for a new invitation.','Undangan tidak tersedia, kedaluwarsa, dicabut, atau sudah digunakan. Minta undangan baru kepada pemilik bisnis.')}</p>
    {:else if flow}
      <Button class="w-full" disabled={busy} onclick={open}>{copy('Continue','Lanjutkan')}</Button>
    {/if}
    <Button variant="ghost" class="w-full" disabled={busy} onclick={leave}>{copy('Leave invitation flow','Keluar dari alur undangan')}</Button>
  </Card.Content>
</Card.Root>
