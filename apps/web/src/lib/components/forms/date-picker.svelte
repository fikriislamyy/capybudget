<script lang="ts">
  import { formatDate, dateInputToISO } from '$lib/dates';
  import { getContext } from 'svelte';
  import { parseDate, type DateValue } from '@internationalized/date';
  import CalendarIcon from '@lucide/svelte/icons/calendar';
  import { Calendar } from '$lib/components/ui/calendar';
  import * as Popover from '$lib/components/ui/popover';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { AUTH_UI_CONTEXT, type AuthUiState } from '$lib/i18n/auth';
  let { value = $bindable(''), id, required = false, disabled = false, min, max, class: className, ...rest }: {
    value?: string | null; id?: string; required?: boolean; disabled?: boolean; min?: string; max?: string; class?: string;
    'aria-label'?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean | 'true' | 'false';
  } = $props();
  const ui = getContext<AuthUiState>(AUTH_UI_CONTEXT);
  let open = $state(false);
  function parsed(raw?: string | null): DateValue | undefined { try { return raw ? parseDate(raw) : undefined; } catch { return undefined; } }
  const selected = $derived(parsed(value));
  let input = $state<HTMLInputElement | null>(null);
  $effect(() => {
    const date = parsed(value);
    const tooEarly = date && parsed(min) && date.compare(parsed(min)!) < 0;
    const tooLate = date && parsed(max) && date.compare(parsed(max)!) > 0;
    input?.setCustomValidity(value && (!date || tooEarly || tooLate) ? (isId ? 'Pilih tanggal yang valid dalam rentang yang diizinkan.' : 'Choose a valid date within the allowed range.') : '');
  });
  const isId = $derived(ui?.locale === 'id');
  function pick(next: DateValue | undefined) {
    if (required && !next) return;
    value = next?.toString() ?? '';
    open = false;
  }
</script>

<div class={className} data-slot="date-picker">
  <Input bind:ref={input} {id} {required} {disabled} {...rest} value={formatDate(value, '')} placeholder="DD-MM-YYYY" inputmode="numeric" pattern={'[0-9]{2}-[0-9]{2}-[0-9]{4}'} aria-label={rest['aria-label']} oninput={(event) => { value = dateInputToISO(event.currentTarget.value); }} />
  <Popover.Root bind:open>
    <Popover.Trigger>
      {#snippet child({ props })}<Button {...props} {disabled} type="button" variant="ghost" size="icon" aria-label={isId ? 'Pilih tanggal' : 'Choose date'}><CalendarIcon /></Button>{/snippet}
    </Popover.Trigger>
    <Popover.Content align="end" class="calendar-popover">
      <Calendar type="single" value={selected} onValueChange={pick} {disabled} preventDeselect={required} locale={isId ? 'id-ID' : 'en-US'} minValue={parsed(min)} maxValue={parsed(max)} captionLayout="dropdown" initialFocus />
      {#if !required}<Button type="button" variant="ghost" onclick={() => pick(undefined)}>{isId ? 'Hapus tanggal' : 'Clear date'}</Button>{/if}
    </Popover.Content>
  </Popover.Root>
</div>

<style>
  [data-slot='date-picker']{position:relative;min-width:0;display:flex;align-items:center}
  [data-slot='date-picker'] :global([data-slot='input']){padding-right:48px;width:100%}
  [data-slot='date-picker'] :global([data-slot='button']){position:absolute;right:2px}
  :global(.calendar-popover){width:auto;max-width:calc(100vw - 16px);padding:8px}
</style>
