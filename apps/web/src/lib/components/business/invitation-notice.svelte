<script lang="ts">
  import { goto } from '$app/navigation';
  import { Button } from '$lib/components/ui/button';
  import type { InvitationFlow } from '$lib/invitation';
  let { invitation, locale }: { invitation: InvitationFlow | null; locale: 'en' | 'id' } = $props();
  let busy = $state(false), error = $state('');
  const copy = (en:string,id:string) => locale === 'id' ? id : en;
  async function cancel() {
    busy = true; error = '';
    try {
      const response = await fetch('/api/business/invitations/flow/cancel',{method:'POST'});
      if (!response.ok) throw new Error(copy('Please try again.','Silakan coba lagi.'));
      await goto('/login',{invalidateAll:true});
    } catch (cause) { error = cause instanceof Error ? cause.message : String(cause); }
    finally { busy = false; }
  }
</script>
{#if invitation?.email}
  <aside class="mb-6 space-y-2 rounded-[14px] border-2 border-border bg-muted/40 p-4" aria-label={copy('Team invitation','Undangan tim')}>
    <p class="text-sm font-semibold">{copy('Join ','Bergabung ke ')}{invitation.businessName}</p>
    <p class="text-sm text-muted-foreground">{copy('This invitation is for ','Undangan ini untuk ')}<span class="break-words">{invitation.email}</span>. {copy('Your email is fixed so you join the right team.','Email dikunci agar Anda bergabung ke tim yang tepat.')}</p>
    {#if error}<p role="alert" class="text-sm text-destructive">{error}</p>{/if}
    <Button variant="ghost" type="button" class="min-h-11" disabled={busy} onclick={cancel}>{copy('Cancel invitation flow','Batalkan alur undangan')}</Button>
  </aside>
{/if}
