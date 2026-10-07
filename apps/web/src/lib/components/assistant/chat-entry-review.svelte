<script lang="ts">
  import {getContext} from 'svelte';
  import {AUTH_UI_CONTEXT,type AuthUiState} from '$lib/i18n/auth';
  import {Button} from '$lib/components/ui/button';
  import {Input} from '$lib/components/ui/input';
  import ChoiceSelect from '$lib/components/forms/choice-select.svelte';
  import AmountInput from '$lib/components/forms/amount-input.svelte';
  import DatePicker from '$lib/components/forms/date-picker.svelte';
  let {draft=$bindable(),busy,onConfirm,onCancel}:{draft:any;busy:boolean;onConfirm:()=>void;onCancel:()=>void}=$props();
  const ui=getContext<AuthUiState>(AUTH_UI_CONTEXT),L=(en:string,id:string)=>ui.locale==='id'?id:en;
  const ready=$derived(Boolean(draft.fields.type&&draft.fields.amount&&draft.fields.date&&draft.fields.accountId&&draft.fields.categoryId));
</script>

<form class="review" onsubmit={e=>{e.preventDefault();if(ready&&!busy)onConfirm();}}>
  <h3>{L('Review your transaction','Tinjau transaksimu')}</h3>
  <p>{L('This is a draft. Complete any missing fields and confirm before it is saved.','Ini masih draf. Lengkapi informasi yang belum ada dan konfirmasi sebelum disimpan.')}</p>
  <label>{L('Type','Jenis')}<ChoiceSelect bind:value={draft.fields.type} onValueChange={()=>draft.fields.categoryId=''} disabled={busy} items={[{value:'',label:L('Select','Pilih')},{value:'expense',label:L('Expense','Pengeluaran')},{value:'income',label:L('Income','Pemasukan')}]} required/></label>
  <label>{L('Amount','Jumlah')} · {draft.fields.currency}<AmountInput bind:value={draft.fields.amount} currency={draft.fields.currency} disabled={busy} required/></label>
  <label>{L('Payment account','Akun pembayaran')}<ChoiceSelect bind:value={draft.fields.accountId} disabled={busy} items={[{value:'',label:L('Select','Pilih')},...draft.accounts.map((a:any)=>({value:a.id,label:`${a.name} · ${a.currency}`}))]} required/></label>
  <label>{L('Category','Kategori')}<ChoiceSelect bind:value={draft.fields.categoryId} disabled={busy} items={[{value:'',label:L('Select','Pilih')},...draft.categories.filter((c:any)=>c.type===draft.fields.type).map((c:any)=>({value:c.id,label:c.name}))]} required/></label>
  <label>{L('Date','Tanggal')}<DatePicker bind:value={draft.fields.date} disabled={busy} required/></label>
  <label>{L('Merchant','Penjual')}<Input bind:value={draft.fields.merchant} disabled={busy} maxlength={200}/></label>
  <div class="actions"><Button type="submit" disabled={busy||!ready}>{busy?L('Saving…','Menyimpan…'):L('Confirm & save','Konfirmasi & simpan')}</Button><Button variant="ghost" onclick={onCancel} disabled={busy}>{L('Cancel','Batalkan')}</Button></div>
</form>

<style>
  .review{display:grid;gap:12px;padding:16px;background:var(--card);border:2px solid var(--border);border-radius:var(--radius-card)}h3{font:500 20px var(--font-heading)}p{color:var(--muted-foreground);font-size:14px;line-height:1.5}label{display:grid;gap:8px;font-size:14px;font-weight:600}.actions{display:flex;flex-wrap:wrap;gap:8px}.actions :global(button){min-height:44px}
</style>
