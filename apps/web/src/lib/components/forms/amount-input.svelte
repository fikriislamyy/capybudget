<script lang="ts">
  import { getContext, tick } from 'svelte';
  import type { HTMLInputAttributes } from 'svelte/elements';
  import { Input } from '$lib/components/ui/input';
  import { AUTH_UI_CONTEXT, type AuthUiState } from '$lib/i18n/auth';
  import { cn } from '$lib/utils';
  let { value = $bindable<string>(), currency, ref = $bindable<HTMLInputElement | null>(null), type = 'text', class: className, name, onkeydown, onfocus, onblur, placeholder, ...rest }: Omit<HTMLInputAttributes, 'value' | 'type' | 'files' | 'oninput'> & {
    value?: string; currency?: string; ref?: HTMLInputElement | null; type?: 'text' | 'password';
  } = $props();
  const uid = $props.id();
  const currencyHint = `${uid}-currency`;
  const ui = getContext<AuthUiState>(AUTH_UI_CONTEXT);
  const workspace = getContext<{ selectedId: string; items: { id: string; currency: string }[] }>('capybudget-workspaces');
  const code = $derived((currency || workspace?.items.find(item => item.id === workspace.selectedId)?.currency || 'IDR').trim().toUpperCase());
  const locale = $derived(ui?.locale === 'id' ? 'id-ID' : 'en-US');
  const currencyFormat = $derived.by(() => {
    try { return new Intl.NumberFormat(locale, { style: 'currency', currency: code }); }
    catch { return new Intl.NumberFormat(locale, { style: 'currency', currency: 'IDR' }); }
  });
  const parts = $derived(currencyFormat.formatToParts(1234.5));
  const symbol = $derived(parts.find(part => part.type === 'currency')?.value ?? code);
  const group = $derived(parts.find(part => part.type === 'group')?.value ?? (locale === 'id-ID' ? '.' : ','));
  const decimal = $derived(new Intl.NumberFormat(locale).formatToParts(1.5).find(part => part.type === 'decimal')?.value ?? '.');
  const integerFormat = $derived(new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }));
  let focused = $state(false);
  function format(raw: string, pad = false) {
    if (!raw || raw === '-') return raw;
    const match = /^(-?)(\d*)(?:\.(\d*))?$/.exec(raw);
    if (!match) return raw;
    const whole = integerFormat.format(BigInt(match[2] || '0'));
    const fraction = match[3] ?? '';
    const places = pad ? currencyFormat.resolvedOptions().minimumFractionDigits ?? 0 : 0;
    const digits = fraction.padEnd(places, '0');
    return match[1] + whole + (digits || raw.includes('.') ? decimal + digits : '');
  }
  const display = $derived(format(value ?? '', !focused));
  function parse(text: string) {
    const stripped = text.replaceAll(symbol, '').replaceAll(code, '').replace(/[\s\u00a0\u202f]/g, '');
    const raw = stripped.replaceAll(group, '').replace(decimal, '.');
    if (!/^-?\d*(?:\.\d{0,4})?$/.test(raw)) return null;
    if (raw === '' || raw === '-') return raw;
    const [whole, fraction] = raw.split('.');
    const negative = whole.startsWith('-');
    const digits = whole.replace('-', '').replace(/^0+(?=\d)/, '') || '0';
    return (negative ? '-' : '') + digits + (fraction !== undefined ? '.' + fraction : '');
  }
  function input(event: Event) {
    const target = event.currentTarget as HTMLInputElement;
    const before = target.value;
    const caret = target.selectionStart ?? before.length;
    const position = [...before.slice(0, caret)].filter(char => /\d/.test(char) || char === decimal || char === '-').length;
    const next = parse(before);
    if (next !== null) value = next;
    const formatted = format(value ?? '');
    target.value = formatted;
    let offset = 0, count = 0;
    while (offset < formatted.length && count < position) {
      const char = formatted[offset++];
      if (/\d/.test(char) || char === decimal || char === '-') count++;
    }
    void tick().then(() => { if (document.activeElement === target) target.setSelectionRange(offset, offset); });
  }
  function paste(event: ClipboardEvent) {
    const text = event.clipboardData?.getData('text/plain').trim();
    // A plain API decimal is also accepted when it cannot be mistaken for local grouping.
    if (decimal !== '.' && text && /^-?\d+\.\d{1,4}$/.test(text) && !/^-?\d{1,3}(\.\d{3})+$/.test(text)) {
      event.preventDefault();
      const target = event.currentTarget as HTMLInputElement;
      const start = target.selectionStart ?? 0, end = target.selectionEnd ?? 0;
      target.value = target.value.slice(0, start) + text.replace('.', decimal) + target.value.slice(end);
      target.setSelectionRange(start + text.length, start + text.length);
      input(event);
    }
  }
  function keydown(event: KeyboardEvent) {
    const target = event.currentTarget as HTMLInputElement;
    const start = target.selectionStart ?? 0;
    if (start === target.selectionEnd) {
      if (event.key === 'Backspace' && start > 0 && target.value[start - 1] === group) target.setSelectionRange(Math.max(0, start - 2), start);
      if (event.key === 'Delete' && target.value[start] === group) target.setSelectionRange(start, start + 2);
    }
    if (event.key === 'Enter' && value?.endsWith('.')) value = value.slice(0, -1);
    onkeydown?.(event as KeyboardEvent & { currentTarget: EventTarget & HTMLInputElement });
  }
  $effect(() => { ref?.setCustomValidity(value === '-' ? (ui?.locale === 'id' ? 'Masukkan jumlah yang valid.' : 'Enter a valid amount.') : ''); });
</script>
<div class={cn('amount-input', className)} data-slot="amount-input" data-currency={code}>
  <span class="currency" aria-hidden="true">{type === 'password' ? code : symbol}</span>
  <Input {...rest} bind:ref {type} value={display} aria-describedby={[rest['aria-describedby'], currencyHint].filter(Boolean).join(' ')} inputmode="decimal" placeholder={format('0', true)} oninput={input} onpaste={paste} onkeydown={keydown}
    onfocus={(event) => { focused = true; onfocus?.(event); }}
    onblur={(event) => { focused = false; if (value?.endsWith('.')) value = value.slice(0, -1); onblur?.(event); }} />
  <span id={currencyHint} class="sr-only">{code}</span>
  {#if name}<input type="hidden" {name} value={value ?? ''} />{/if}
</div>
<style>
  .amount-input{display:flex;position:relative;align-items:center;min-width:0;width:100%}
  .currency{position:absolute;left:14px;font-size:13px;font-weight:700;color:var(--muted-foreground);pointer-events:none;z-index:1}
  .amount-input :global([data-slot='input']){padding-left:64px;font-variant-numeric:tabular-nums}
</style>
