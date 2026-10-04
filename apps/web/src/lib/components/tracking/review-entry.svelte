<script lang="ts">
 import {getContext,untrack} from 'svelte';
 import {AUTH_UI_CONTEXT,type AuthUiState} from '$lib/i18n/auth';
 import {PRIVACY_CONTEXT,type PrivacyState} from '$lib/privacy';
 import {Button} from '$lib/components/ui/button';
 import {Input} from '$lib/components/ui/input';
 import * as Card from '$lib/components/ui/card';
 import DatePicker from '$lib/components/forms/date-picker.svelte';
 import ChoiceSelect from '$lib/components/forms/choice-select.svelte';
 import AmountInput from '$lib/components/forms/amount-input.svelte';
 import LoadingScope from '$lib/components/shared/loading-scope.svelte';
 let {entry,accounts,categories,initialAccount='',onSave,onSkip,receipt=false}:{entry:{id:string;status:string;normalized?:any;extracted?:any;raw?:any;error?:string};accounts:{id:string;name:string;currency:string}[];categories:{id:string;name:string;type:string}[];initialAccount?:string;onSave:(value:any)=>Promise<void>;onSkip?:()=>Promise<void>;receipt?:boolean}=$props();
 const ui=getContext<AuthUiState>(AUTH_UI_CONTEXT),privacy=getContext<PrivacyState>(PRIVACY_CONTEXT),copy=(en:string,id:string)=>ui.locale==='id'?id:en;
 const uid=$props.id();const initial=untrack(()=>entry.normalized??entry.extracted??{});
 let accountId=$state(untrack(()=>initialAccount)),type=$state(initial.type??'expense'),date=$state(/^\d{4}-\d{2}-\d{2}$/.test(initial.date??'')?initial.date:''),amount=$state(initial.amount??''),merchant=$state(initial.merchant??''),categoryId=$state(''),notes=$state(initial.notes??''),transferDirection=$state(initial.type==='income'?'incoming':'outgoing'),destinationAccountId=$state(''),destinationAmount=$state(''),matchId=$state(''),busy=$state(false),error=$state('');
 const currency=$derived(accounts.find(x=>x.id===accountId)?.currency??'IDR');
 async function save(allowDuplicate=false){busy=true;error='';try{const incoming=!receipt&&type==='transfer'&&transferDirection==='incoming';const otherCurrency=accounts.find(x=>x.id===destinationAccountId)?.currency;const sourceId=incoming?destinationAccountId:accountId;await onSave({values:{accountId:sourceId,type,date,amount:incoming&&otherCurrency!==currency?destinationAmount:amount,merchant,notes,currency:accounts.find(x=>x.id===sourceId)?.currency,...(type==='transfer'?{destinationAccountId:incoming?accountId:destinationAccountId,destinationAmount:(incoming?amount:destinationAmount)||undefined}:{categoryId})},categoryId,matchTransactionId:matchId||undefined,allowDuplicate});}catch(e){error=(e as Error).message;}finally{busy=false;}}
 async function skip(){busy=true;error='';try{await onSkip?.();}catch(e){error=(e as Error).message;}finally{busy=false;}}
</script>
<LoadingScope active={busy}/>
<Card.Root><Card.Header><Card.Title>{merchant||copy('Review transaction','Tinjau transaksi')}</Card.Title><Card.Description>{entry.error??(receipt?copy('Check the photo before saving. OCR may miss digits or dates.','Periksa foto sebelum menyimpan. OCR dapat salah membaca angka atau tanggal.'):copy('Compare each field with the original statement.','Bandingkan setiap data dengan mutasi asli.'))}</Card.Description></Card.Header><Card.Content>
 {#if entry.raw}<details><summary>{copy('Original row','Baris asli')}</summary><dl>{#each Object.entries(entry.raw) as [key,value]}<dt>{key}</dt><dd>{privacy.hidden?'••••••':String(value)}</dd>{/each}</dl></details>{/if}
 <form onsubmit={(e)=>{e.preventDefault();void save();}}>
 <div class="fields">
 <div><label for={`${uid}-account`}>{copy('Account','Akun')}</label><ChoiceSelect id={`${uid}-account`} bind:value={accountId} disabled={!receipt} required items={[{value:'',label:'Select'},...accounts.map(x=>({value:x.id,label:`${x.name} · ${x.currency}`}))]}/></div>
 <div><label for={`${uid}-type`}>{copy('Type','Jenis')}</label><ChoiceSelect id={`${uid}-type`} bind:value={type} items={[{value:'expense',label:copy('Expense','Pengeluaran')},{value:'income',label:copy('Income','Pemasukan')},{value:'transfer',label:copy('Transfer','Transfer')}]} /></div>
 <div><label for={`${uid}-date`}>{copy('Date','Tanggal')}</label><DatePicker id={`${uid}-date`} bind:value={date} required/></div>
 <div><label for={`${uid}-amount`}>{copy('Amount','Jumlah')}</label><AmountInput id={`${uid}-amount`} type={privacy.hidden?'password':'text'} bind:value={amount} {currency} required/></div>
 {#if type==='transfer'}
 {#if !receipt}<div><label for={`${uid}-direction`}>{copy('Transfer direction','Arah transfer')}</label><ChoiceSelect id={`${uid}-direction`} bind:value={transferDirection} items={[{value:'outgoing',label:copy('Paid from this account','Keluar dari akun ini')},{value:'incoming',label:copy('Received into this account','Masuk ke akun ini')}]} /></div>{/if}
 <div><label for={`${uid}-destination`}>{!receipt&&transferDirection==='incoming'?copy('From account','Akun asal'):copy('To account','Akun tujuan')}</label><ChoiceSelect id={`${uid}-destination`} bind:value={destinationAccountId} required items={[{value:'',label:'Select'},...accounts.filter(x=>x.id!==accountId).map(x=>({value:x.id,label:`${x.name} · ${x.currency}`}))]}/></div>
 <div><label for={`${uid}-received`}>{!receipt&&transferDirection==='incoming'?copy('Amount sent from the other currency','Jumlah dikirim dari mata uang lain'):copy('Amount received (foreign transfer)','Jumlah diterima (transfer valas)')}</label><AmountInput id={`${uid}-received`} type={privacy.hidden?'password':'text'} bind:value={destinationAmount} currency={accounts.find(x=>x.id===destinationAccountId)?.currency}/></div>
 {:else}<div><label for={`${uid}-category`}>{copy('Category','Kategori')}</label><ChoiceSelect id={`${uid}-category`} bind:value={categoryId} required items={[{value:'',label:'Select'},...categories.filter(x=>x.type===type).map(x=>({value:x.id,label:x.name}))]}/></div>{/if}
 <div><label for={`${uid}-merchant`}>{copy('Merchant','Merchant')}</label><Input id={`${uid}-merchant`} bind:value={merchant} maxlength={200}/></div>
 <div><label for={`${uid}-notes`}>{copy('Notes','Catatan')}</label><Input id={`${uid}-notes`} bind:value={notes} maxlength={2000}/></div>
 </div>
 {#if initial.duplicateIds?.length}<p class="duplicate">{copy('A similar transaction already exists. Check before keeping both.','Transaksi serupa sudah ada. Periksa sebelum menyimpan keduanya.')}</p><label for={`${uid}-match`}>{copy('Link an existing transaction','Tautkan transaksi yang sudah ada')}</label><ChoiceSelect id={`${uid}-match`} bind:value={matchId} items={[{value:'',label:'Select'},...initial.duplicateIds.map((id:string)=>({value:id,label:id}))]}/>{/if}
 {#if error}<p role="alert" class="error">{error}</p>{/if}
 <div class="actions"><Button type="submit" disabled={busy}>{matchId?copy('Link existing','Tautkan yang sudah ada'):copy('Record transaction','Catat transaksi')}</Button><Button type="button" variant="outline" disabled={busy} onclick={()=>save(true)}>{copy('Reviewed: keep both','Sudah ditinjau: simpan keduanya')}</Button>{#if onSkip}<Button type="button" variant="ghost" disabled={busy} onclick={skip}>{copy('Skip row','Lewati baris')}</Button>{/if}</div>
 </form>
</Card.Content></Card.Root>
<style>.fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.fields>div{display:grid;gap:8px}label{font-size:14px;font-weight:600}.actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}.error{color:var(--expense-ink)}.duplicate{padding:12px;border:2px solid var(--border);border-radius:var(--radius-input);background:var(--secondary)}details{margin-bottom:16px}summary{min-height:44px;cursor:pointer}dl{display:grid;grid-template-columns:auto 1fr;gap:8px;font-size:14px}dd{margin:0;overflow-wrap:anywhere}@media(max-width:600px){.fields{grid-template-columns:1fr}}</style>
