<script lang="ts">
 import {getContext} from 'svelte';
 import {AUTH_UI_CONTEXT,type AuthUiState} from '$lib/i18n/auth';
 import * as Card from '$lib/components/ui/card';
 import {Button} from '$lib/components/ui/button';
 import {Input} from '$lib/components/ui/input';
 import ChoiceSelect from '$lib/components/forms/choice-select.svelte';
 import DatePicker from '$lib/components/forms/date-picker.svelte';
 import AmountInput from '$lib/components/forms/amount-input.svelte';
 import MoneyDisplay from '$lib/components/shared/money-display.svelte';
 import LoadingScope from '$lib/components/shared/loading-scope.svelte';
 import ErrorState from '$lib/components/shared/error-state.svelte';
 import {Checkbox} from '$lib/components/ui/checkbox';
 const workspace=getContext<{ready:boolean;selectedId:string;revision?:number}>('capybudget-workspaces'),ui=getContext<AuthUiState>(AUTH_UI_CONTEXT);
 const text=(en:string,id:string)=>ui.locale==='id'?id:en;
 type Bucket={id:string;name:string;allocation:string;categoryIds:string[];spent:string;remaining:string};
 type Plan={id:string;name:string;method:string;fundingBasis:string;currency:string;funding:string;unassigned:string;status:string;revision:number;buckets:Bucket[]};
 let plans:Plan[]=$state([]),categories:{id:string;name:string}[]=$state([]),busy=$state(false),error=$state(''),name=$state(''),method=$state('50-30-20'),basis=$state('planned'),funding=$state(''),starts=$state(new Date().toISOString().slice(0,10)),ends=$state(''),names=$state('Food, Housing, Savings'),from=$state(''),to=$state(''),moveAmount=$state('');
 const methodExplanation=$derived(method==='50-30-20'
  ? {
   description:text('Split your funding into 50% for needs, 30% for wants, and 20% for savings and debt. Needs cover essentials like rent; wants cover extras like entertainment.','Bagi dana menjadi 50% untuk kebutuhan, 30% untuk keinginan, dan 20% untuk tabungan dan utang. Kebutuhan mencakup hal pokok seperti sewa; keinginan mencakup tambahan seperti hiburan.'),
   guidance:text('Assign your categories to these three buckets. Their allocations are calculated automatically.','Masukkan kategori ke tiga pos ini. Alokasinya dihitung otomatis.')
  }
  : method==='zero-based'
  ? {
   description:text('Give all your funding a purpose: spending, saving, or paying debt. Set an amount for each bucket until nothing is left unassigned.','Beri seluruh dana tujuan: pengeluaran, tabungan, atau pembayaran utang. Tentukan jumlah setiap pos sampai tidak ada dana yang belum dialokasikan.'),
   guidance:text('You can save a draft along the way. All funding must be assigned before finalizing; your bank balance does not need to be zero.','Anda bisa menyimpan draf selama menyusun rencana. Seluruh dana harus dialokasikan sebelum finalisasi; saldo bank tidak harus nol.')
  }
  : {
   description:text('Set aside funding in named envelopes, such as food or transport. Recorded spending reduces the amount available in its envelope.','Sisihkan dana ke amplop bernama, seperti makanan atau transportasi. Pengeluaran tercatat mengurangi dana tersedia di amplopnya.'),
   guidance:text('Move unspent allocation between envelopes when plans change. This adjusts your budget without moving money between accounts.','Pindahkan alokasi yang belum terpakai antar-amplop saat rencana berubah. Ini mengubah anggaran tanpa memindahkan uang antar-akun.')
  });
 let sequence=0;
 async function load(){const id=workspace.selectedId,n=++sequence;if(!id)return;busy=true;error='';try{const [a,b]=await Promise.all([fetch(`/api/workspaces/${id}/budget-plans`),fetch(`/api/workspaces/${id}/categories`)]);const [p,c]=await Promise.all([a.json(),b.json()]);if(!a.ok||!b.ok)throw new Error(p.message??c.message);if(n===sequence&&id===workspace.selectedId){plans=p.items;categories=c.items.filter((x:{type:string})=>x.type==='expense');}}catch(e){if(n===sequence)error=e instanceof Error?e.message:String(e);}finally{if(n===sequence)busy=false;}}
 $effect(()=>{void workspace.revision;if(workspace.ready&&workspace.selectedId)void load();});
 async function send(path:string,body:unknown,verb='POST'){if(busy)return;busy=true;error='';try{const r=await fetch(`/api/workspaces/${workspace.selectedId}/budget-plans${path}`,{method:verb,headers:{'content-type':'application/json'},body:JSON.stringify(body)}),b=await r.json();if(!r.ok)throw new Error(b.message);await load();}catch(e){error=e instanceof Error?e.message:String(e);}finally{busy=false;}}
 function toggle(bucket:Bucket,id:string,checked:boolean){bucket.categoryIds=checked?[...bucket.categoryIds,id]:bucket.categoryIds.filter(x=>x!==id);}
</script>
<LoadingScope active={busy}/>
<section class="methods" aria-label={text('Budget methods','Metode anggaran')}>
<Card.Root><Card.Header><Card.Title>{text('Give every rupiah a place','Beri setiap rupiah tujuan')}</Card.Title><Card.Description>{text('Choose a method for a specific period. Planned income is a plan, not cash you already have.','Pilih metode untuk periode tertentu. Pendapatan rencana bukan uang yang sudah tersedia.')}</Card.Description></Card.Header><Card.Content>
{#if error}<ErrorState title={text('Please check your plan','Periksa rencana Anda')} message={error} />{/if}
<form onsubmit={(e)=>{e.preventDefault();void send('',{name,method,fundingBasis:basis,plannedFunding:funding||'0',startsOn:starts,endsOn:ends,buckets:names.split(',').map(x=>x.trim()).filter(Boolean)});}}>
<div class="fields">
<label for="plan-name">{text('Plan name','Nama rencana')}<Input id="plan-name" bind:value={name} required maxlength={100}/></label>
<div class="method-field">
 <label for="plan-method">{text('Method','Metode')}<ChoiceSelect id="plan-method" bind:value={method} aria-describedby="plan-method-explanation" items={[{value:'50-30-20',label:'50/30/20'},{value:'zero-based',label:text('Zero-based','Berbasis nol')},{value:'envelope',label:text('Envelope','Amplop')}]}/></label>
 <div id="plan-method-explanation" class="method-explanation" aria-live="polite" aria-atomic="true">
  <p>{methodExplanation.description}</p>
  <p>{methodExplanation.guidance}</p>
 </div>
</div>
<label for="plan-start">{text('Start date','Tanggal mulai')}<DatePicker id="plan-start" bind:value={starts} required/></label>
<label for="plan-end">{text('End date (not included)','Tanggal akhir (tidak termasuk)')}<DatePicker id="plan-end" bind:value={ends} required/></label>
<label for="plan-basis">{text('Funding basis','Sumber dana')}<ChoiceSelect id="plan-basis" bind:value={basis} items={[{value:'planned',label:text('Planned net income','Pendapatan bersih rencana')},{value:'received',label:text('Income received in this period','Pendapatan diterima pada periode ini')}]}/></label>
{#if basis==='planned'}<label for="plan-funding">{text('Planned funding','Dana rencana')}<AmountInput id="plan-funding" bind:value={funding} required/></label>{/if}
{#if method!=='50-30-20'}<label for="plan-buckets">{text('Bucket names (separated by commas)','Nama pos (pisahkan dengan koma)')}<Input id="plan-buckets" bind:value={names} required/></label>{/if}
</div><Button type="submit" disabled={busy}>{text('Create plan','Buat rencana')}</Button>
</form></Card.Content></Card.Root>
{#each plans as plan(plan.id)}
<Card.Root><Card.Header><Card.Title>{plan.name}</Card.Title><Card.Description>{plan.method} · {plan.status==='finalized'?text('Finalized','Final'):text('Draft','Draf')} · {plan.fundingBasis==='planned'?text('Planned income','Pendapatan rencana'):text('Received income','Pendapatan diterima')}</Card.Description></Card.Header><Card.Content>
<div class="summary"><span>{text('Funding','Dana')} <MoneyDisplay amount={plan.funding} currency={plan.currency}/></span><span>{text('Unassigned','Belum dialokasikan')} <MoneyDisplay amount={plan.unassigned} currency={plan.currency}/></span></div>
<div class="buckets">{#each plan.buckets as bucket(bucket.id)}<div class="bucket">
<label for={`bucket-${bucket.id}`}>{text('Bucket','Pos')}<Input id={`bucket-${bucket.id}`} bind:value={bucket.name} maxlength={100}/></label>
<label for={`allocation-${bucket.id}`}>{text('Allocation','Alokasi')}<AmountInput id={`allocation-${bucket.id}`} bind:value={bucket.allocation} currency={plan.currency} disabled={plan.method==='50-30-20'}/></label>
<p>{text('Spent','Terpakai')}: <MoneyDisplay amount={bucket.spent} currency={plan.currency}/> · {text('Remaining','Tersisa')}: <MoneyDisplay amount={bucket.remaining} currency={plan.currency}/></p>
<details><summary>{text('Assign categories','Atur kategori')} ({bucket.categoryIds.length})</summary><div class="categories">{#each categories as cat}<label class="check"><Checkbox checked={bucket.categoryIds.includes(cat.id)} onCheckedChange={(v)=>toggle(bucket,cat.id,!!v)} />{cat.name}</label>{/each}</div></details>
</div>{/each}</div>
<div class="actions"><Button variant="outline" disabled={busy} onclick={()=>send(`/${plan.id}`,{revision:plan.revision,buckets:plan.buckets},'PATCH')}>{text('Save draft','Simpan draf')}</Button><Button disabled={busy} onclick={()=>send(`/${plan.id}`,{revision:plan.revision,buckets:plan.buckets,finalize:true},'PATCH')}>{text('Save and finalize','Simpan dan finalisasi')}</Button></div>
{#if plan.method==='envelope'}<details><summary>{text('Move unspent allocation','Pindahkan alokasi tersisa')}</summary><form onsubmit={(e)=>{e.preventDefault();void send(`/${plan.id}/movements`,{fromBucketId:from,toBucketId:to,amount:moveAmount,idempotencyKey:crypto.randomUUID()});}}><div class="fields">
<label for={`from-${plan.id}`}>{text('From envelope','Dari amplop')}<ChoiceSelect id={`from-${plan.id}`} bind:value={from} items={plan.buckets.map(b=>({value:b.id,label:b.name}))} required/></label>
<label for={`to-${plan.id}`}>{text('To envelope','Ke amplop')}<ChoiceSelect id={`to-${plan.id}`} bind:value={to} items={plan.buckets.map(b=>({value:b.id,label:b.name}))} required/></label>
<label for={`move-${plan.id}`}>{text('Amount','Jumlah')}<AmountInput id={`move-${plan.id}`} bind:value={moveAmount} currency={plan.currency} required/></label></div>
<p class="hint">{text('This moves budget allocation. Your accounts and transactions stay the same.','Ini memindahkan alokasi anggaran. Saldo dan transaksi tetap sama.')}</p><Button type="submit" disabled={busy}>{text('Move allocation','Pindahkan alokasi')}</Button></form></details>{/if}
</Card.Content></Card.Root>{/each}
</section>
<style>
 .method-field{display:grid;gap:12px;align-content:start}.method-explanation{padding:12px;background:var(--muted);border-radius:var(--radius-input,14px)}.method-explanation p{margin:0;color:var(--foreground);line-height:1.6}.method-explanation p+p{margin-top:8px}
.methods{display:grid;gap:24px;margin-top:32px}.fields,.buckets{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:16px;margin-bottom:16px}.fields,.buckets{align-items:start}label{display:grid;align-content:start;gap:8px;font-size:14px}label :global([data-slot=select-trigger]){width:100%}.summary,.actions{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px}.summary span{display:grid;gap:4px}.bucket{padding:16px;border:2px solid var(--border);border-radius:var(--radius-card,20px);display:grid;align-content:start;gap:12px}p,.hint{font-size:14px;color:var(--muted-foreground)}summary{min-height:44px;display:flex;align-items:center;cursor:pointer;font-weight:600}summary:focus-visible{outline:2px solid var(--ring);outline-offset:4px}.categories{display:grid;gap:8px}.check{display:flex;align-items:center;gap:12px;min-height:44px}.actions{margin-top:16px}
</style>
