<script lang="ts">
  import { getContext } from 'svelte';
  import { AUTH_UI_CONTEXT, type AuthUiState } from '$lib/i18n/auth';
  import ChoiceSelect from '$lib/components/forms/choice-select.svelte';
  import { Input } from '$lib/components/ui/input';
  type Rate = { id: string; name: string; rate: string; baseNumerator: number; baseDenominator: number;
    inclusive: boolean; effectiveFrom: string; effectiveTo: string | null; archivedAt: string | null; applicability: string };
  let { id, rateId = $bindable(), manualRate = $bindable('0'), rates, enabled, date }:
    { id: string; rateId?: string | null; manualRate?: string; rates: Rate[]; enabled: boolean; date: string } = $props();
  const ui = getContext<AuthUiState>(AUTH_UI_CONTEXT);
  const isId = $derived(ui.locale === 'id');
  const active = $derived(rates.filter(rate => !rate.archivedAt && rate.effectiveFrom <= date && (!rate.effectiveTo || rate.effectiveTo >= date)));
  const selected = $derived(rates.find(rate => rate.id === rateId));
  const unavailable = $derived(!!rateId && (!enabled || !active.some(rate => rate.id === rateId)));
</script>

<div class="tax-picker">
  <ChoiceSelect {id} value={rateId || 'manual'} onValueChange={(value) => { rateId = value === 'manual' ? '' : value; manualRate = '0'; }}
    items={[{value:'manual',label:isId?'Tanpa tarif tersimpan':'No saved rate'}, ...(enabled ? active.map(rate => ({ value:rate.id, label:rate.name })) : []),
      ...(unavailable ? [{value:rateId!,label:(selected?.name ?? (isId?'Tarif sebelumnya':'Previous rate'))+' · '+(isId?'tidak tersedia':'unavailable')}] : [])]} />
  {#if !rateId}<Input id={id+'-manual'} aria-label={isId?'Persentase pajak manual':'Manual tax percentage'} bind:value={manualRate} disabled={!enabled} inputmode="decimal" />
  {:else if selected}<p>{selected.rate}% × {selected.baseNumerator}/{selected.baseDenominator} · {selected.inclusive ? (isId?'Termasuk harga':'Included in price') : (isId?'Ditambahkan':'Added to price')}</p><p>{selected.applicability}</p>{/if}
  {#if !enabled}<p>{isId?'Pajak nonaktif. Pemilik dapat mengaktifkannya di Pajak bisnis.':'Tax is off. The owner can enable it in Business tax.'}</p>{/if}
  {#if unavailable}<p class="unavailable" role="status">{isId?'Pilih tarif yang berlaku pada tanggal faktur sebelum menyimpan.':'Choose a rate valid on the invoice date before saving.'}</p>{/if}
</div>
<style>.tax-picker{display:grid;gap:8px;min-width:0}.tax-picker p{font-size:12px;color:var(--muted-foreground);margin:0;overflow-wrap:anywhere}.tax-picker .unavailable{color:var(--destructive)}</style>
