<script lang="ts">
  import { getContext, tick } from 'svelte';
  import type { HTMLInputAttributes } from 'svelte/elements';
  import Eye from '@lucide/svelte/icons/eye';
  import EyeOff from '@lucide/svelte/icons/eye-off';
  import { Input } from '$lib/components/ui/input';
  import { Button } from '$lib/components/ui/button';
  import { AUTH_UI_CONTEXT, type AuthUiState } from '$lib/i18n/auth';
  import { cn } from '$lib/utils';
  let { value = $bindable<string>(), ref = $bindable<HTMLInputElement | null>(null), class: className, ...rest }: Omit<HTMLInputAttributes, 'value' | 'type' | 'files'> & { value?: string; ref?: HTMLInputElement | null } = $props();
  const ui = getContext<AuthUiState>(AUTH_UI_CONTEXT);
  let visible = $state(false);
  const isPin = $derived(String(rest.id ?? '').includes('pin'));
  const isConfirmation = $derived(String(rest.id ?? '').includes('confirm'));
  const label = $derived(ui?.locale === 'id' ? `${visible ? 'Sembunyikan' : 'Tampilkan'} ${isPin ? 'PIN' : isConfirmation ? 'konfirmasi kata sandi' : 'kata sandi'}` : `${visible ? 'Hide' : 'Show'} ${isPin ? 'PIN' : isConfirmation ? 'confirmation password' : 'password'}`);
  async function toggle() {
    const start = ref?.selectionStart, end = ref?.selectionEnd;
    const restore = document.activeElement === ref;
    visible = !visible;
    await tick();
    if (restore && start != null && end != null) ref?.setSelectionRange(start, end);
  }
</script>
<div class={cn('password-input', className)}>
  <Input {...rest} bind:ref bind:value type={visible ? 'text' : 'password'} />
  <Button class="password-toggle" variant="ghost" size="icon" type="button" aria-label={label} aria-pressed={visible} aria-controls={rest.id} onmousedown={(event) => event.preventDefault()} onclick={toggle}>
    {#if visible}<EyeOff aria-hidden="true" />{:else}<Eye aria-hidden="true" />{/if}
  </Button>
</div>
<style>
  .password-input{position:relative;width:100%;min-width:0}
  .password-input :global([data-slot='input']){padding-right:52px}
  :global(.password-toggle){position:absolute;right:2px;top:50%;transform:translateY(-50%);width:44px;height:44px;min-height:44px;color:var(--muted-foreground)}
  :global(.password-toggle:active){transform:translateY(-50%) !important}
</style>
