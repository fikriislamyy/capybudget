<script lang="ts" generics="T extends string | number | string[] | null">
  import * as Select from '$lib/components/ui/select';
  import { cn } from '$lib/utils';
  type Item = { value: string | number; label: string; disabled?: boolean };
  let { value = $bindable<T>(), items, multiple = false, id, name, required = false, disabled = false, class: className, onValueChange, ...rest }: {
    value?: T; items: Item[]; multiple?: boolean; id?: string; name?: string; required?: boolean; disabled?: boolean;
    class?: string; onValueChange?: (value: T) => void; 'aria-label'?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean | 'true' | 'false';
  } = $props();
  const uid = $props.id();
  const emptyKey = `${uid}-empty`;
  const normalized = $derived(items.map(item => ({ ...item, label: item.label?.trim() || '—', value: item.value == null || item.value === '' ? emptyKey : String(item.value) })));
  const selected = $derived(Array.isArray(value) ? value.map(String) : value == null || value === '' ? emptyKey : String(value ?? ''));
  const label = $derived(Array.isArray(value) ? items.filter(item => (value as string[]).includes(String(item.value))).map(item => item.label?.trim() || '—').join(', ') || '—' : items.find(item => String(item.value) === String(value ?? ''))?.label?.trim() || '—');
  let trigger = $state<HTMLButtonElement | null>(null);
  function change(next: string | string[]) {
    const result = Array.isArray(next) ? next : items.find(item => (item.value == null || item.value === '' ? emptyKey : String(item.value)) === next)?.value ?? '';
    trigger?.removeAttribute('aria-invalid');
    value = result as T;
    onValueChange?.(value);
  }
</script>

<div class={cn('choice-select', className)}>
  {#if multiple}
    <Select.Root type="multiple" value={Array.isArray(selected) ? selected : []} onValueChange={change} items={normalized} {name} {disabled}>
      <Select.Trigger bind:ref={trigger} id={id ?? uid} aria-required={required} {...rest}><span data-slot="select-value">{label || '—'}</span></Select.Trigger>
      <Select.Content><Select.Group>{#each normalized as item (item.value)}<Select.Item value={item.value} label={item.label} disabled={item.disabled} />{/each}</Select.Group></Select.Content>
    </Select.Root>
  {:else}
    <Select.Root type="single" value={typeof selected === 'string' ? selected : ''} onValueChange={change} items={normalized} {name} {disabled}>
      <Select.Trigger bind:ref={trigger} id={id ?? uid} aria-required={required} {...rest}><Select.Value placeholder="—">{label}</Select.Value></Select.Trigger>
      <Select.Content><Select.Group>{#each normalized as item (item.value)}<Select.Item value={item.value} label={item.label} disabled={item.disabled} />{/each}</Select.Group></Select.Content>
    </Select.Root>
  {/if}
  {#if required}
    <input class="validation-proxy" tabindex="-1" aria-hidden="true" value={Array.isArray(value) ? value.join(',') : value ?? ''} {required} {disabled} oninvalid={(event) => { event.preventDefault(); trigger?.focus(); trigger?.setAttribute('aria-invalid', 'true'); }} />
  {/if}
</div>

<style>
  .choice-select{position:relative;min-width:0;width:100%}
  .validation-proxy{position:absolute;opacity:0;width:1px;height:1px;pointer-events:none;padding:0;border:0}
</style>
