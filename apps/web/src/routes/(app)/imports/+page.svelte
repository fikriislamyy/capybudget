<script lang="ts">
 import {getContext,onMount} from 'svelte';
 import {AUTH_UI_CONTEXT,type AuthUiState} from '$lib/i18n/auth';
 import {Button} from '$lib/components/ui/button';
 import {Input} from '$lib/components/ui/input';
 import * as AlertDialog from '$lib/components/ui/alert-dialog';
 import * as Card from '$lib/components/ui/card';
 import ChoiceSelect from '$lib/components/forms/choice-select.svelte';
 import PageHeader from '$lib/components/shared/page-header.svelte';
 import LoadingScope from '$lib/components/shared/loading-scope.svelte';
 import EmptyState from '$lib/components/shared/empty-state.svelte';
 import MoneyDisplay from '$lib/components/shared/money-display.svelte';
 import ReviewEntry from '$lib/components/tracking/review-entry.svelte';
 type Account={id:string;name:string;currency:string};type Category={id:string;name:string;type:string};
 type Row={id:string;rowNumber:number;status:string;raw:Record<string,string>;normalized:any;error?:string};
 type Job={id:string;name:string;status:string;accountId:string;mapping:any;error?:string};
 type Receipt={id:string;name:string;status:string;extracted:any;error?:string;transactionId?:string};
 const ws=getContext<{selectedId:string}>('capybudget-workspaces'),ui=getContext<AuthUiState>(AUTH_UI_CONTEXT),copy=(en:string,id:string)=>ui.locale==='id'?id:en;
 let accounts=$state<Account[]>([]),categories=$state<Category[]>([]),accountId=$state(''),mode=$state('statement'),kind=$state('csv'),delimiter=$state(','),file=$state<File|null>(null),busy=$state(false),error=$state(''),notice=$state(''),jobs=$state<Job[]>([]),job=$state<Job|null>(null),rows=$state<Row[]>([]),receipts=$state<Receipt[]>([]),page=$state(0),mappingRevision=$state(0),defaultedJob='',sequence=0;
 let deleteTarget=$state<Job|null>(null),deleting=$state(false),deletingId=$state(''),jobRequestSequence=0,listRequestSequence=0;
 let mapping=$state({date:'',amount:'',debit:'',credit:'',merchant:'',notes:'',currency:'',reference:'',dateFormat:'dd-mm-yyyy',decimal:'.',defaultType:'expense'});
 const columns=$derived(rows[0]?.raw?Object.keys(rows[0].raw):[]),options=$derived([{value:'',label:copy('Select','Pilih')},...columns.map(x=>({value:x,label:x}))]);
 const totals=$derived.by(()=>{
  const sums={income:0n,expense:0n,postedIncome:0n,postedExpense:0n};
  for(const row of rows){const n=row.normalized;if(!n||!['income','expense'].includes(n.type)||!/^\d+(\.\d{1,4})?$/.test(n.amount))continue;const [whole,fraction='']=n.amount.split('.');const value=BigInt(whole)*10000n+BigInt(fraction.padEnd(4,'0'));const type=n.type as 'income'|'expense';sums[type]+=value;if(row.status==='posted')sums[type==='income'?'postedIncome':'postedExpense']+=value;}
  return Object.fromEntries(Object.entries(sums).map(([key,value])=>[key,`${value/10000n}.${(value%10000n).toString().padStart(4,'0')}`])) as Record<keyof typeof sums,string>;
 });
 const remaining=$derived(rows.filter(x=>!['posted','skipped'].includes(x.status))),shown=$derived(remaining.slice(page*10,page*10+10));
 $effect(()=>{const id=ws.selectedId;sequence++;jobRequestSequence++;job=null;rows=[];receipts=[];accountId='';file=null;deleteTarget=null;if(id)void initialize(id);});
 async function request(path:string,body?:unknown,method?:string){const r=await fetch(`/api/workspaces/${ws.selectedId}/${path}`,{method:method??(body===undefined?'GET':'POST'),...(body===undefined?{}:{headers:{'content-type':'application/json'},body:JSON.stringify(body)})});const j=await r.json();if(!r.ok)throw new Error(j.message??copy('Unable to complete the request.','Permintaan tidak dapat diselesaikan.'));return j;}
 async function initialize(id:string){const current=sequence;busy=true;error='';try{const [a,c,j,r]=await Promise.all(['accounts','categories','imports','receipts'].map(path=>fetch(`/api/workspaces/${id}/${path}`).then(async(res)=>{const data=await res.json();if(!res.ok)throw new Error(data.message);return data;})));if(current!==sequence)return;accounts=a.items;categories=c.items;jobs=j.items;receipts=r.items;accountId=accounts[0]?.id??'';}catch(e){if(current===sequence)error=(e as Error).message;}finally{if(current===sequence)busy=false;}}
 async function reloadJobs(){const current=sequence,listSequence=++listRequestSequence;const [j,r]=await Promise.all([request('imports'),request('receipts')]);if(current!==sequence||listSequence!==listRequestSequence)return;jobs=j.items;receipts=r.items;}
 async function loadJob(id:string,initial=false){
  const current=sequence,jobSequence=++jobRequestSequence,j=await request(`imports/${id}`);if(current!==sequence||jobSequence!==jobRequestSequence||id===deletingId)return;
  job=j.job;rows=j.items;accountId=j.job.accountId;
  page=Math.min(page,Math.max(0,Math.ceil(j.items.filter((x:Row)=>!['posted','skipped'].includes(x.status)).length/10)-1));
  if(initial){page=0;defaultedJob='';mapping={...mapping,date:'',amount:'',debit:'',credit:'',merchant:'',notes:'',currency:'',reference:''};}
  // Processing finishes after the initial upload response; initialize when its rows arrive.
  if(defaultedJob!==id&&j.items.length){
   if(j.job.mapping?.date)mapping={...mapping,...j.job.mapping};
   else if(j.items[0]?.raw?.date!==undefined){
    const raw=j.items[0].raw;
    mapping={...mapping,date:'date',merchant:raw.merchant!==undefined?'merchant':'',notes:raw.notes!==undefined?'notes':'',amount:raw.amount!==undefined?'amount':'',debit:raw.debit!==undefined?'debit':'',credit:raw.credit!==undefined?'credit':'',currency:'',reference:'',dateFormat:'dd-mm-yyyy',decimal:'.'};
   }
   defaultedJob=id;
  }
 }

 async function upload(e:SubmitEvent){e.preventDefault();const form=e.currentTarget as HTMLFormElement;if(!file||busy)return;busy=true;error='';notice='';const chosen=file;try{const path=mode==='receipt'?'receipts':`imports?accountId=${encodeURIComponent(accountId)}&kind=${kind}&delimiter=${encodeURIComponent(delimiter)}`;const joiner=path.includes('?')?'&':'?';const r=await fetch(`/api/workspaces/${ws.selectedId}/${path}${joiner}name=${encodeURIComponent(chosen.name)}`,{method:'POST',headers:{'content-type':chosen.type||'application/octet-stream'},body:chosen});const j=await r.json();if(!r.ok)throw new Error(j.message);if(mode==='statement')await loadJob(j.id,true);await reloadJobs();notice=copy('Uploaded. The background worker is reading your document. Review is required before recording.','Diunggah. Dokumen sedang dibaca. Tinjau hasilnya sebelum mencatat transaksi.');file=null;const input=form.querySelector<HTMLInputElement>('input[type=file]');if(input)input.value='';}catch(e){error=(e as Error).message;}finally{busy=false;}}
 async function map(){if(!job)return;busy=true;error='';try{await request(`imports/${job.id}/map`,mapping);mappingRevision++;await loadJob(job.id);await reloadJobs();page=0;}catch(e){error=(e as Error).message;}finally{busy=false;}}
 async function saveRow(row:Row,input:any){if(!job)return;await request(`imports/${job.id}/confirm`,{rows:[{id:row.id,...input}]});await loadJob(job.id);await reloadJobs();}
 async function skipRow(row:Row){if(!job)return;await request(`imports/${job.id}/confirm`,{rows:[{id:row.id,skip:true}]});await loadJob(job.id);await reloadJobs();}
 async function saveReceipt(receipt:Receipt,input:any){await request(`receipts/${receipt.id}/confirm`,input);await reloadJobs();}
 async function retry(path:string){busy=true;error='';try{await request(path,{});await reloadJobs();}catch(e){error=(e as Error).message;}finally{busy=false;}}
 async function deleteStatement(){
  const target=deleteTarget,id=ws.selectedId,current=sequence;
  if(!target||deleting||!id)return;
  deleting=true;deletingId=target.id;busy=true;error='';
  jobRequestSequence++;listRequestSequence++;
  try{
   await request(`imports/${target.id}`,undefined,'DELETE');
   if(current!==sequence)return;
   jobs=jobs.filter(item=>item.id!==target.id);
   if(job?.id===target.id){job=null;rows=[];page=0;defaultedJob='';}
   notice=copy('Statement deleted. Recorded transactions are kept.','Mutasi dihapus. Transaksi yang sudah dicatat tetap tersimpan.');
   await reloadJobs();
  }catch(e){if(current===sequence)error=(e as Error).message;}
  finally{deleting=false;deletingId='';if(current===sequence){busy=false;deleteTarget=null;}}
 }
 onMount(()=>{let polling=false;const timer=setInterval(async()=>{if(polling||busy||!ws.selectedId||!jobs.some(x=>['queued','processing'].includes(x.status))&&!receipts.some(x=>['queued','processing'].includes(x.status)))return;polling=true;const current=sequence;try{await reloadJobs();if(current===sequence&&job&&['queued','processing'].includes(job.status))await loadJob(job.id,true);}catch(e){if(current===sequence)error=(e as Error).message;}finally{polling=false;}},2500);return()=>clearInterval(timer);});
</script>
<LoadingScope active={busy}/>
<PageHeader eyebrow={copy('CALM, CAREFUL CAPTURE','PENCATATAN YANG TELITI')} title={copy('Import & scan','Impor & pindai')} description={copy('Upload a bank or e-wallet statement (mutasi), or scan a receipt. You decide what gets recorded.','Unggah mutasi bank atau e-wallet, atau pindai struk. Anda menentukan transaksi yang dicatat.')} />
{#if error}<p role="alert" class="error">{error}</p>{/if}{#if notice}<p role="status" class="notice">{notice}</p>{/if}
<div class="capture-grid">
<Card.Root><Card.Header><Card.Title>{copy('Add a document','Tambah dokumen')}</Card.Title><Card.Description>{copy('Maximum 10 MB / 5,000 transactions. OCR runs locally; nothing is sent to an AI service.','Maksimal 10 MB / 5.000 transaksi. OCR berjalan lokal; dokumen tidak dikirim ke layanan AI.')}</Card.Description></Card.Header><Card.Content><form onsubmit={upload}>
<label for="capture-mode">{copy('Document type','Jenis dokumen')}</label><ChoiceSelect id="capture-mode" bind:value={mode} items={[{value:'statement',label:copy('Bank / e-wallet statement','Mutasi bank / e-wallet')},{value:'receipt',label:copy('Receipt photo','Foto struk')}]} />
{#if mode==='statement'}
<label for="capture-account">{copy('Record into account','Catat ke akun')}</label><ChoiceSelect id="capture-account" bind:value={accountId} required items={[{value:'',label:'Select'},...accounts.map(x=>({value:x.id,label:`${x.name} · ${x.currency}`}))]} />
<label for="capture-format">{copy('File format','Format berkas')}</label><ChoiceSelect id="capture-format" bind:value={kind} items={[{value:'csv',label:'CSV'},{value:'xlsx',label:'Excel (.xlsx)'},{value:'pdf',label:'PDF'},{value:'image',label:copy('Statement image (JPEG/PNG)','Gambar mutasi (JPEG/PNG)')}]} />
{#if kind==='csv'}<label for="csv-delimiter">{copy('Column separator','Pemisah kolom')}</label><ChoiceSelect id="csv-delimiter" bind:value={delimiter} items={[{value:',',label:copy('Comma','Koma')},{value:';',label:copy('Semicolon','Titik koma')}]} />{/if}
{/if}
<label for="capture-file">{copy('Choose document','Pilih dokumen')}</label><Input id="capture-file" type="file" required accept={mode==='receipt'?'image/jpeg,image/png,image/webp':kind==='csv'?'.csv':kind==='xlsx'?'.xlsx':kind==='pdf'?'.pdf':'image/jpeg,image/png'} onchange={(e)=>file=e.currentTarget.files?.[0]??null}/>
<Button type="submit" disabled={busy||!file||mode==='statement'&&!accountId}>{copy('Upload and review','Unggah dan tinjau')}</Button>
<p class="hint">{copy('This is statement-based sync: upload again for new activity. Original statements and unconfirmed receipt files expire after 7 days. Confirmed receipts stay attached to their transaction.','Sinkronisasi ini berdasarkan mutasi: unggah lagi untuk aktivitas baru. Mutasi asli dan struk yang belum dikonfirmasi kedaluwarsa setelah 7 hari. Struk yang dikonfirmasi tetap dilampirkan pada transaksi.')}</p>
</form></Card.Content></Card.Root>
<Card.Root><Card.Header><Card.Title>{copy('Recent statements','Mutasi terbaru')}</Card.Title></Card.Header><Card.Content>
{#if !jobs.length}<EmptyState title={copy('Nothing to review yet','Belum ada dokumen')} body={copy('Upload your first statement to get started.','Unggah mutasi pertama Anda.')} actionLabel={copy('Choose document','Pilih dokumen')} actionHref="#capture-file"/>{:else}<ul>{#each jobs as item (item.id)}<li><div><strong>{item.name}</strong><p>{item.status}</p>{#if item.error}<p class="error">{item.error}</p>{/if}</div><Button variant="outline" disabled={busy} onclick={()=>loadJob(item.id,true)}>{copy('Review','Tinjau')}</Button>{#if item.status==='failed'}<Button variant="ghost" onclick={()=>retry(`imports/${item.id}/retry`)}>{copy('Retry','Coba lagi')}</Button>{/if}<Button variant="ghost" class="delete-statement" disabled={busy} aria-label={`${copy('Delete statement','Hapus mutasi')}: ${item.name}`} onclick={()=>deleteTarget=item}>{copy('Delete','Hapus')}</Button></li>{/each}</ul>{/if}
</Card.Content></Card.Root>
</div>
{#if job}<section aria-label={copy('Statement review','Tinjauan mutasi')}>
 <Card.Root><Card.Header><Card.Title>{job.name}</Card.Title><Card.Description>{job.status} · {rows.filter(x=>x.status==='posted').length} {copy('recorded','tercatat')} · {rows.filter(x=>x.status==='skipped').length} {copy('skipped','dilewati')} · {remaining.length} {copy('remaining','tersisa')}</Card.Description></Card.Header><Card.Content>
 <div class="reconciliation" aria-label={copy('Import totals','Total impor')}>
 <p>{copy('Mapped income','Pemasukan dipetakan')}: <MoneyDisplay amount={totals.income} currency={accounts.find(a=>a.id===job?.accountId)?.currency??''}/></p>
 <p>{copy('Mapped expenses','Pengeluaran dipetakan')}: <MoneyDisplay amount={totals.expense} currency={accounts.find(a=>a.id===job?.accountId)?.currency??''}/></p>
 <p>{copy('Recorded income','Pemasukan tercatat')}: <MoneyDisplay amount={totals.postedIncome} currency={accounts.find(a=>a.id===job?.accountId)?.currency??''}/></p>
 <p>{copy('Recorded expenses','Pengeluaran tercatat')}: <MoneyDisplay amount={totals.postedExpense} currency={accounts.find(a=>a.id===job?.accountId)?.currency??''}/></p>
 <p>{rows.filter(r=>r.status==='invalid').length} {copy('invalid rows — correct or skip before completing','baris tidak valid — perbaiki atau lewati sebelum menyelesaikan')}</p>
 <p>{copy('Transfers are excluded from income and expenses. Compare these totals with your statement.','Transfer tidak termasuk pemasukan dan pengeluaran. Bandingkan total ini dengan mutasi Anda.')}</p>
 </div>
 <Button variant="outline" href={`/api/workspaces/${ws.selectedId}/imports/${job.id}/file`} target="_blank" rel="noopener noreferrer">{copy('View original document','Lihat dokumen asli')}</Button>
 {#if job.error}<p role="alert" class="error">{job.error}</p><Button variant="outline" href="/transactions">{copy('Enter transactions manually','Catat transaksi secara manual')}</Button>{/if}
 {#if columns.length}<form class="mapping" onsubmit={(e)=>{e.preventDefault();void map();}}>
 {#each ['date','amount','debit','credit','merchant','notes','currency','reference'] as field}<div><label for={`map-${field}`}>{copy(({date:'Date',amount:'Signed amount',debit:'Debit',credit:'Credit',merchant:'Merchant',notes:'Notes',currency:'Currency',reference:'Reference'} as Record<string,string>)[field],({date:'Tanggal',amount:'Jumlah bertanda',debit:'Debit',credit:'Kredit',merchant:'Merchant',notes:'Catatan',currency:'Mata uang',reference:'Referensi'} as Record<string,string>)[field])}</label><ChoiceSelect id={`map-${field}`} value={mapping[field as keyof typeof mapping]} onValueChange={(v)=>mapping={...mapping,[field]:v}} items={options}/></div>{/each}
 <div><label for="map-date-format">{copy('Date format in file','Format tanggal dalam berkas')}</label><ChoiceSelect id="map-date-format" bind:value={mapping.dateFormat} items={['dd-mm-yyyy','mm-dd-yyyy','yyyy-mm-dd'].map(x=>({value:x,label:x}))}/></div>
 <div><label for="map-decimal">{copy('Decimal separator','Pemisah desimal')}</label><ChoiceSelect id="map-decimal" bind:value={mapping.decimal} items={[{value:'.',label:'1,234.56'},{value:',',label:'1.234,56'}]}/></div>
 <div><label for="map-type">{copy('Positive amount means','Jumlah positif berarti')}</label><ChoiceSelect id="map-type" bind:value={mapping.defaultType} items={[{value:'expense',label:copy('Expense','Pengeluaran')},{value:'income',label:copy('Income','Pemasukan')}]} /></div>
 <Button type="submit" disabled={busy}>{copy('Apply mapping & check duplicates','Terapkan pemetaan & periksa duplikat')}</Button>
 </form>{/if}
 </Card.Content></Card.Root>
 {#if job.status==='review'||job.status==='complete'}<div class="review-rows">{#each shown as row (`${row.id}:${mappingRevision}`)}<ReviewEntry entry={row} {accounts} {categories} initialAccount={job.accountId} onSave={(input)=>saveRow(row,input)} onSkip={()=>skipRow(row)}/>{/each}</div>
 <div class="pagination"><Button variant="outline" disabled={page===0} onclick={()=>page--}>{copy('Previous','Sebelumnya')}</Button><span>{page+1} / {Math.max(1,Math.ceil(remaining.length/10))}</span><Button variant="outline" disabled={(page+1)*10>=remaining.length} onclick={()=>page++}>{copy('Next','Berikutnya')}</Button></div>{/if}
</section>{/if}
{#if receipts.length}<section aria-label={copy('Receipt review','Tinjauan struk')}><h2>{copy('Receipts','Struk')}</h2><div class="review-rows">{#each receipts as receipt (receipt.id)}
{#if receipt.status!=='confirmed'}<div class="receipt"><div><p>{receipt.name} · {receipt.status}</p>{#if typeof receipt.extracted?.confidence==='number'}<p>{copy('OCR confidence','Keyakinan OCR')}: {Math.round(receipt.extracted.confidence)}% · {copy('Please verify every field.','Periksa setiap kolom.')}</p>{/if}<img loading="lazy" src={`/api/workspaces/${ws.selectedId}/receipts/${receipt.id}/image`} alt={copy('Original receipt for review','Struk asli untuk ditinjau')}/><p>{copy('Extracted text may be unclear. Check the original before saving.','Hasil pembacaan dapat keliru. Periksa struk asli sebelum menyimpan.')}</p>{#if receipt.status==='failed'}<Button variant="outline" onclick={()=>retry(`receipts/${receipt.id}/retry`)}>{copy('Retry scan','Pindai ulang')}</Button>{/if}</div>
{#if ['review','failed'].includes(receipt.status)}<ReviewEntry entry={receipt} {accounts} {categories} receipt onSave={(input)=>saveReceipt(receipt,input)}/>{/if}</div>{/if}
{/each}</div></section>{/if}
<AlertDialog.Root open={!!deleteTarget} onOpenChange={(open)=>{if(!open&&!deleting)deleteTarget=null;}}>
 <AlertDialog.Content>
  <AlertDialog.Header>
   <AlertDialog.Title>{copy('Delete this statement?','Hapus mutasi ini?')}</AlertDialog.Title>
   <AlertDialog.Description>{copy('This removes the uploaded document and its review rows. Queued processing stops, and any running result is discarded. Transactions already recorded in your accounts are kept.','Dokumen yang diunggah dan baris tinjauannya akan dihapus. Antrean pemrosesan dihentikan dan hasil yang sedang diproses akan dibuang. Transaksi yang sudah dicatat di akun tetap tersimpan.')}</AlertDialog.Description>
  </AlertDialog.Header>
  <AlertDialog.Footer>
   <AlertDialog.Cancel disabled={deleting} onclick={()=>deleteTarget=null}>{copy('Cancel','Batal')}</AlertDialog.Cancel>
   <Button class="delete-statement" disabled={deleting} onclick={deleteStatement}>{deleting?copy('Deleting…','Menghapus…'):copy('Delete statement','Hapus mutasi')}</Button>
  </AlertDialog.Footer>
 </AlertDialog.Content>
</AlertDialog.Root>
<style>:global(.delete-statement){color:var(--expense-ink);background:var(--coral-soft)}.reconciliation{display:grid;gap:8px;margin-bottom:16px;padding:16px;border:2px solid var(--border);border-radius:var(--radius-card);background:var(--secondary)}.reconciliation p{margin:0;font-size:14px}.capture-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px;align-items:start}form{display:grid;gap:12px}label{font-size:14px;font-weight:600}.hint{font-size:14px;color:var(--muted-foreground);line-height:1.6}ul{list-style:none;padding:0;margin:0;display:grid;gap:16px}li{display:flex;gap:8px;align-items:center;border-bottom:2px solid var(--border);padding-bottom:12px}li>div{min-width:0;flex:1}li strong{overflow-wrap:anywhere}li p{font-size:14px;margin:4px 0}section{margin-top:24px}.mapping{grid-template-columns:repeat(2,minmax(0,1fr));margin-top:24px;gap:16px}.mapping>div{display:grid;gap:8px}.review-rows{display:grid;gap:24px;margin-top:24px}.pagination{display:flex;align-items:center;justify-content:center;gap:16px;margin-top:24px}.receipt{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,2fr);gap:24px;align-items:start}.receipt img{width:100%;max-height:480px;object-fit:contain;border:2px solid var(--border);border-radius:var(--radius-card);background:var(--secondary)}.error{color:var(--expense-ink)}.notice{color:var(--income-ink)}@media(max-width:850px){.capture-grid,.receipt{grid-template-columns:1fr}}@media(max-width:600px){.mapping{grid-template-columns:1fr}li{flex-wrap:wrap}}</style>
