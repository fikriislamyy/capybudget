<script lang="ts">
  import PurchaseTaxPanel from "$lib/components/business/purchase-tax-panel.svelte";
  import { getContext } from 'svelte';
  import { AUTH_UI_CONTEXT, type AuthUiState } from '$lib/i18n/auth';
  import { Button } from '$lib/components/ui/button';
  import * as Card from '$lib/components/ui/card';
  import * as Field from '$lib/components/ui/field';
  import { Input } from '$lib/components/ui/input';
  import ChoiceSelect from '$lib/components/forms/choice-select.svelte';
  import DatePicker from '$lib/components/forms/date-picker.svelte';
  import PageHeader from '$lib/components/shared/page-header.svelte';
  import LoadingScope from '$lib/components/shared/loading-scope.svelte';
  import ErrorState from '$lib/components/shared/error-state.svelte';
  import { formatDate } from '$lib/dates';
  import MoneyDisplay from '$lib/components/shared/money-display.svelte';

  type Rate = { id: string; name: string; rate: string; baseNumerator: number; baseDenominator: number;
    inclusive: boolean; effectiveFrom: string; effectiveTo: string | null; applicability: string; archivedAt: string | null };
  const workspace = getContext<{ selectedId: string; ready: boolean; revision?: number }>('capybudget-workspaces');
  const ui = getContext<AuthUiState>(AUTH_UI_CONTEXT);
  const copy = (en: string, id: string) => ui.locale === 'id' ? id : en;
  let canReadReports=$state(false);
  let enabled = $state(false), version = $state(0), canConfigure = $state(false), rates: Rate[] = $state([]);
  let loading = $state(false), saving = $state(false), error = $state(''), notice = $state('');
  let name = $state(''), rate = $state(''), numerator = $state('1'), denominator = $state('1');
  let treatment = $state('exclusive'), from = $state(''), to = $state(''), applicability = $state('');
  let sequence = 0;
  type Register = { rows: { invoiceId: string; number: string; issueDate: string; currency: string; netAmount: string; taxAmount: string; totalAmount: string; effectiveRate: string }[];
    totals: { currency: string; netAmount: string; taxAmount: string; totalAmount: string }[] };
  let register: Register | null = $state(null), reportFrom = $state(''), reportThrough = $state(''), reporting = $state(false), reportSequence = 0;
  let reportPage = $state(0);
  const endpoint = (ws: string) => '/api/workspaces/' + ws + '/business-tax';
  async function call(url: string, method = 'GET', body?: unknown) {
    const response = await fetch(url, { method, ...(body === undefined ? {} : {
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message ?? copy('The request could not be completed.', 'Permintaan tidak dapat diselesaikan.'));
    return result;
  }
  async function load(ws: string) {
    const current = ++sequence; loading = true; error = ''; canConfigure = false; rates = []; enabled = false; version = 0;
    try {
      const [result,access] = await Promise.all([call(endpoint(ws)),call('/api/workspaces/'+ws+'/business-access')]);
      if (current !== sequence || ws !== workspace.selectedId) return;
      canReadReports=['owner','accountant','viewer'].includes(access.role);enabled = result.settings.enabled; version = result.settings.version;
      rates = result.rates; canConfigure = result.canConfigure;
    } catch (e) { if (current === sequence) error = e instanceof Error ? e.message : String(e); }
    finally { if (current === sequence) loading = false; }
  }
  $effect(() => {
    void workspace.revision;
    if (workspace.ready && workspace.selectedId) {
      name = ''; rate = ''; numerator = '1'; denominator = '1'; from = ''; to = ''; applicability = ''; notice = '';
      register = null; reportSequence++;
      void load(workspace.selectedId);
    }
  });
  async function mutate(path: string, method: string, body?: unknown) {
    if (saving || loading || !canConfigure) return false;
    const ws = workspace.selectedId; saving = true; error = ''; notice = '';
    try {
      await call(endpoint(ws) + path, method, body);
      if (ws === workspace.selectedId) { await load(ws); notice = copy('Tax settings saved.', 'Pengaturan pajak tersimpan.'); }
      return ws === workspace.selectedId;
    } catch (e) { if (ws === workspace.selectedId) error = e instanceof Error ? e.message : String(e); return false; }
    finally { saving = false; }
  }
  async function add(event: SubmitEvent) {
    event.preventDefault();
    if (await mutate('/rates', 'POST', { name, rate, baseNumerator: Number(numerator), baseDenominator: Number(denominator),
      inclusive: treatment === 'inclusive', effectiveFrom: from, effectiveTo: to || null, applicability })) {
      name = ''; rate = ''; applicability = '';
    }
  }
  async function archive(item: Rate) {
    if (confirm(copy('Archive this rate? Its history will be kept.', 'Arsipkan tarif ini? Riwayatnya tetap disimpan.'))) {
      await mutate('/rates/' + item.id, 'DELETE');
    }
  }
  async function loadRegister(event: SubmitEvent) {
    event.preventDefault(); if (reporting) return;
    const ws = workspace.selectedId, current = ++reportSequence;
    reporting = true; reportPage = 0; error = ''; register = null;
    try {
      const data = await call(endpoint(ws) + '/register?' + new URLSearchParams({ from: reportFrom, through: reportThrough }));
      if (ws === workspace.selectedId && current === reportSequence) register = data;
    } catch (e) { if (current === reportSequence) error = e instanceof Error ? e.message : String(e); }
    finally { reporting = false; }
  }
  function downloadRegister() {
    if (!register) return;
    const columns: (keyof Register['rows'][number])[] = ['number','issueDate','currency','netAmount','taxAmount','totalAmount','effectiveRate'];
    const cell = (value: string) => '"' + (/^[=+@\-\t\r]/.test(value) ? "'" : '') + value.replaceAll('"','""') + '"';
    const csv = '\uFEFF' + columns.join(',') + '\r\n' + register.rows.map(row => columns.map(key => cell(key === 'issueDate' ? formatDate(String(row[key])) : String(row[key]))).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'capybudget-issued-invoice-tax-register.csv'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
</script>

<svelte:head><title>CapyBudget · {copy('Business tax', 'Pajak bisnis')}</title></svelte:head>
<LoadingScope active={loading || saving || reporting} />
<PageHeader guidePath="/business/tax" title={copy('Business tax', 'Pajak bisnis')} description={copy('Indonesian tax settings, configured for this business.', 'Pengaturan pajak Indonesia untuk bisnis ini.')} />
{#if error}<ErrorState title={copy('Could not save or load settings', 'Pengaturan gagal disimpan atau dimuat')} message={error} onRetry={() => load(workspace.selectedId)} retryLabel={copy('Retry', 'Coba lagi')} />{/if}
<p role="status" aria-live="polite">{notice}</p>
<div class="stack">
  <Card.Root><Card.Header><Card.Title>{copy('Tax is your choice', 'Pajak sesuai kebutuhan bisnis')}</Card.Title>
    <Card.Description>{copy('Tax stays off until the owner enables it. Confirm PKP registration and the applicable rules before using PPN.', 'Pajak tetap nonaktif sampai pemilik mengaktifkannya. Pastikan status PKP dan aturan yang berlaku sebelum menggunakan PPN.')}</Card.Description></Card.Header>
    <Card.Content><div class="setting-row"><p>{enabled ? copy('Enabled for this business', 'Aktif untuk bisnis ini') : copy('Off for this business', 'Nonaktif untuk bisnis ini')}</p>
      {#if canConfigure}<Button variant={enabled ? 'outline' : 'default'} disabled={saving || loading} onclick={() => mutate('', 'PATCH', { enabled: !enabled, version })}>
        {enabled ? copy('Turn tax off', 'Nonaktifkan pajak') : copy('Enable tax', 'Aktifkan pajak')}</Button>{/if}</div>
      <p class="hint">{copy('Changing this setting does not recalculate issued invoices. These settings are not a Coretax filing or a government tax invoice.', 'Pengaturan ini tidak menghitung ulang faktur terbit. Pengaturan ini bukan pelaporan Coretax atau faktur pajak resmi.')}</p>
    </Card.Content></Card.Root>
  {#if canConfigure}
    <Card.Root><Card.Header><Card.Title>{copy('Add a dated rate', 'Tambah tarif bertanggal')}</Card.Title>
      <Card.Description>{copy('Keep each version separate. Archive an old rate instead of changing its history.', 'Simpan setiap versi secara terpisah. Arsipkan tarif lama agar riwayatnya tetap utuh.')}</Card.Description></Card.Header>
      <Card.Content><form onsubmit={add}><div class="fields">
        <Field.Field><Field.FieldLabel for="tax-name">{copy('Rate name', 'Nama tarif')}</Field.FieldLabel><Input id="tax-name" bind:value={name} maxlength={120} required /></Field.Field>
        <Field.Field><Field.FieldLabel for="tax-rate">{copy('Statutory rate (%)', 'Tarif resmi (%)')}</Field.FieldLabel><Input id="tax-rate" bind:value={rate} inputmode="decimal" required /></Field.Field>
        <Field.Field><Field.FieldLabel for="tax-numerator">{copy('Tax-base numerator', 'Pembilang dasar pajak')}</Field.FieldLabel><Input id="tax-numerator" bind:value={numerator} inputmode="numeric" required /></Field.Field>
        <Field.Field><Field.FieldLabel for="tax-denominator">{copy('Tax-base denominator', 'Penyebut dasar pajak')}</Field.FieldLabel><Input id="tax-denominator" bind:value={denominator} inputmode="numeric" required /></Field.Field>
        <Field.Field><Field.FieldLabel for="tax-treatment">{copy('Price treatment', 'Perlakuan harga')}</Field.FieldLabel><ChoiceSelect id="tax-treatment" bind:value={treatment} items={[{ value: 'exclusive', label: copy('Tax added to price', 'Pajak ditambahkan ke harga') }, { value: 'inclusive', label: copy('Tax included in price', 'Harga termasuk pajak') }]} /></Field.Field>
        <Field.Field><Field.FieldLabel for="tax-start">{copy('Effective from', 'Berlaku mulai')}</Field.FieldLabel><DatePicker id="tax-start" bind:value={from} required /></Field.Field>
        <Field.Field><Field.FieldLabel for="tax-end">{copy('Effective until (optional)', 'Berlaku hingga (opsional)')}</Field.FieldLabel><DatePicker id="tax-end" bind:value={to} min={from || undefined} /></Field.Field>
        <Field.Field class="wide"><Field.FieldLabel for="tax-applicability">{copy('When does this rate apply?', 'Kapan tarif ini berlaku?')}</Field.FieldLabel><Input id="tax-applicability" bind:value={applicability} maxlength={1000} required /></Field.Field>
      </div><p class="hint">{copy('A 1/1 tax base uses the full amount. Use another fraction only when it applies to your transaction.', 'Dasar pajak 1/1 menggunakan seluruh nilai. Gunakan pecahan lain hanya jika sesuai dengan transaksi Anda.')}</p>
      <div class="actions"><Button type="submit" disabled={loading || saving}>{saving ? copy('Saving…', 'Menyimpan…') : copy('Save rate', 'Simpan tarif')}</Button></div></form></Card.Content>
    </Card.Root>
  {/if}
  <Card.Root><Card.Header><Card.Title>{copy('Rate history', 'Riwayat tarif')}</Card.Title></Card.Header><Card.Content>
    {#if !rates.length}<p class="hint">{copy('No saved rates yet. Add the rates that apply to this business.', 'Belum ada tarif tersimpan. Tambahkan tarif yang berlaku untuk bisnis ini.')}</p>{:else}
      <ul class="rates">{#each rates as item (item.id)}<li><div><h3>{item.name} {#if item.archivedAt}<span class="hint">· {copy('Archived', 'Diarsipkan')}</span>{/if}</h3>
        <p>{item.rate}% × {item.baseNumerator}/{item.baseDenominator} · {item.inclusive ? copy('Included', 'Termasuk') : copy('Added', 'Ditambahkan')}</p>
        <p class="hint">{formatDate(item.effectiveFrom)} — {item.effectiveTo ? formatDate(item.effectiveTo) : copy('No end date', 'Tanpa tanggal akhir')}</p>
        <p class="hint">{item.applicability}</p></div>{#if canConfigure && !item.archivedAt}<Button variant="outline" disabled={saving || loading} onclick={() => archive(item)} aria-label={copy('Archive ', 'Arsipkan ') + item.name}>{copy('Archive', 'Arsipkan')}</Button>{/if}</li>{/each}</ul>
    {/if}
  </Card.Content></Card.Root>
  {#if canReadReports}<Card.Root><Card.Header><Card.Title>{copy('Issued-invoice tax register', 'Daftar pajak faktur terbit')}</Card.Title>
    <Card.Description>{copy('Sales invoice lines only, with currencies kept separate. This is not a tax return: purchases, input tax credits, and filing rules are excluded.', 'Hanya baris faktur penjualan; mata uang dipisahkan. Ini bukan SPT: pembelian, kredit pajak masukan, dan aturan pelaporan tidak termasuk.')}</Card.Description></Card.Header>
    <Card.Content><form onsubmit={loadRegister}><div class="fields">
      <Field.Field><Field.FieldLabel for="register-from">{copy('From', 'Dari')}</Field.FieldLabel><DatePicker id="register-from" bind:value={reportFrom} required /></Field.Field>
      <Field.Field><Field.FieldLabel for="register-through">{copy('Through', 'Sampai')}</Field.FieldLabel><DatePicker id="register-through" bind:value={reportThrough} min={reportFrom || undefined} required /></Field.Field>
    </div><div class="actions"><Button type="submit" disabled={loading || saving || reporting}>{copy('Show register', 'Tampilkan daftar')}</Button>{#if register}<Button type="button" variant="outline" onclick={downloadRegister}>{copy('Export CSV', 'Ekspor CSV')}</Button>{/if}</div></form>
    {#if register}<div class="register-summary">{#each register.totals as total (total.currency)}<p>{copy('Sales tax', 'Pajak penjualan')} · {total.currency}: <MoneyDisplay amount={total.taxAmount} currency={total.currency} /></p>{/each}</div>
      {#if !register.rows.length}<p class="hint">{copy('No taxable issued invoices in this period.', 'Tidak ada faktur terbit berpajak pada periode ini.')}</p>{:else}
        <!-- svelte-ignore a11y_no_noninteractive_tabindex (The scroll region needs keyboard scrolling.) -->
        <div class="table-wrap" role="region" tabindex="0" aria-label={copy('Issued-invoice tax register', 'Daftar pajak faktur terbit')}><table><thead><tr><th>{copy('Invoice', 'Faktur')}</th><th>{copy('Date', 'Tanggal')}</th><th>{copy('Net', 'Nilai bersih')}</th><th>{copy('Tax', 'Pajak')}</th><th>{copy('Total', 'Total')}</th></tr></thead><tbody>
          {#each register.rows.slice(reportPage*50,(reportPage+1)*50) as row,i (i)}<tr><td><a href={'/invoices/'+row.invoiceId}>{row.number}</a></td><td>{formatDate(row.issueDate)}</td><td><MoneyDisplay amount={row.netAmount} currency={row.currency} /></td><td><MoneyDisplay amount={row.taxAmount} currency={row.currency} /></td><td><MoneyDisplay amount={row.totalAmount} currency={row.currency} /></td></tr>{/each}
        </tbody></table></div>
        <div class="actions"><p aria-live="polite">{copy('Rows', 'Baris')} {reportPage*50+1}–{Math.min((reportPage+1)*50,register.rows.length)} / {register.rows.length}</p><Button variant="outline" disabled={reportPage===0} onclick={() => reportPage--}>{copy('Previous', 'Sebelumnya')}</Button><Button variant="outline" disabled={(reportPage+1)*50>=register.rows.length} onclick={() => reportPage++}>{copy('Next', 'Berikutnya')}</Button></div>
      {/if}
    {/if}</Card.Content></Card.Root>{/if}
  {#if workspace.ready && workspace.selectedId && canReadReports}<PurchaseTaxPanel workspaceId={workspace.selectedId}/>{/if}
</div>
<style>
  .stack{display:grid;gap:24px}.fields{display:grid;gap:16px;align-items:start}.setting-row,.actions{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}.actions{justify-content:flex-end;margin-top:16px}.hint{font-size:14px;color:var(--muted-foreground);line-height:1.6}.rates{list-style:none;padding:0;margin:0;display:grid;gap:16px}.rates li{display:flex;align-items:start;justify-content:space-between;gap:16px;padding:16px;background:var(--muted);border:2px solid var(--border);border-radius:var(--radius-input)}.rates li>div{min-width:0;overflow-wrap:anywhere}h3{font-size:16px;margin:0}p{margin:8px 0}.rates :global(button){flex-shrink:0}
  @media(min-width:768px){.fields{grid-template-columns:repeat(2,minmax(0,1fr))}.fields :global(.wide){grid-column:1/-1}}@media(max-width:480px){.rates li{flex-direction:column}}
  .table-wrap{overflow:auto;max-height:32rem;margin-top:16px;border-radius:var(--radius-input)}table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}th,td{padding:12px;text-align:left;border-bottom:1px solid var(--border);white-space:nowrap}th{font-size:12px;color:var(--muted-foreground)}td a{color:var(--brand-ink);display:inline-flex;align-items:center;min-height:44px}.register-summary{margin-top:16px}
</style>
