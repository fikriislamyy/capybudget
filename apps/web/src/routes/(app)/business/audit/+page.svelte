<script lang="ts">
 import {getContext,untrack} from 'svelte';
 import {AUTH_UI_CONTEXT,type AuthUiState} from '$lib/i18n/auth';
 import {Button} from '$lib/components/ui/button';import * as Card from '$lib/components/ui/card';
 import ChoiceSelect from '$lib/components/forms/choice-select.svelte';
 import PageHeader from '$lib/components/shared/page-header.svelte';import LoadingScope from '$lib/components/shared/loading-scope.svelte';import ErrorState from '$lib/components/shared/error-state.svelte';
 import MoneyDisplay from '$lib/components/shared/money-display.svelte';import {formatDateTime} from '$lib/dates';
 import {PRIVACY_CONTEXT,type PrivacyState} from '$lib/privacy';
 import {auditEntity,auditAction,auditFilters,auditFields,auditValue,auditMoney} from '$lib/business/audit-display';
 const workspace=getContext<{selectedId:string;ready:boolean;revision?:number}>('capybudget-workspaces'),ui=getContext<AuthUiState>(AUTH_UI_CONTEXT);
 const privacy=getContext<PrivacyState>(PRIVACY_CONTEXT);
 const copy=(en:string,id:string)=>ui.locale==='id'?id:en;
 type Entry={id:string;actor:string|null;entity_type:string;entity_id:string;action:string;created_at:string};
 type Change={before:unknown;after:unknown};
 let items:Entry[]=$state([]),page=$state(1),entity=$state(''),loading=$state(false),error=$state('');
 let details:Change|null=$state(null),detailId=$state(''),detailLoading=$state(false),detailError=$state(''),sequence=0,detailSequence=0;
 const endpoint=(ws:string)=>'/api/workspaces/'+ws+'/business-audit';
 async function load(ws:string){
  const current=++sequence;loading=true;error='';details=null;detailId='';detailError='';detailLoading=false;detailSequence++;
  try{const response=await fetch(endpoint(ws)+'?'+new URLSearchParams({page:String(page),entity}));const result=await response.json();if(!response.ok)throw new Error(result.message);if(current===sequence&&ws===workspace.selectedId)items=result.items;}
  catch(e){if(current===sequence)error=e instanceof Error?e.message:String(e);}finally{if(current===sequence)loading=false;}
 }
 $effect(()=>{void workspace.revision;if(workspace.ready&&workspace.selectedId){const ws=workspace.selectedId;untrack(()=>{page=1;entity='';items=[];void load(ws);});}});
 async function show(id:string){
  if(detailId===id&&!detailError){detailSequence++;detailId='';details=null;detailLoading=false;return;}
  const ws=workspace.selectedId,current=++detailSequence;details=null;detailId=id;detailLoading=true;detailError='';
  try{const response=await fetch(endpoint(ws)+'/'+id),result=await response.json();if(!response.ok)throw new Error(result.message);if(ws===workspace.selectedId&&current===detailSequence)details={before:result.entry.before,after:result.entry.after};}
  catch(e){if(current===detailSequence)detailError=e instanceof Error?e.message:String(e);}
  finally{if(current===detailSequence)detailLoading=false;}
 }
</script>

<svelte:head><title>CapyBudget · {copy('Audit trail','Riwayat audit')}</title></svelte:head>
<LoadingScope active={loading}/>
<PageHeader title={copy('Audit trail','Riwayat audit')} description={copy('A history of your business activity: who did what, and when. Private information stays hidden.','Riwayat aktivitas bisnis: siapa melakukan apa, dan kapan. Informasi pribadi tetap disembunyikan.')}/>
{#if error}<ErrorState title={copy('Could not load activity','Aktivitas gagal dimuat')} message={error} onRetry={()=>load(workspace.selectedId)} retryLabel={copy('Retry','Coba lagi')}/>{/if}
<Card.Root>
 <Card.Header><Card.Title>{copy('Business activity','Aktivitas bisnis')}</Card.Title><Card.Description>{copy('Open an activity to see the recorded details. This history is for viewing; opening it does not change your records.','Buka aktivitas untuk melihat detail yang tercatat. Riwayat ini hanya untuk dilihat; membukanya tidak mengubah catatan Anda.')}</Card.Description></Card.Header>
 <Card.Content class="space-y-6">
  <form class="flex flex-wrap items-end gap-4" onsubmit={event=>{event.preventDefault();page=1;void load(workspace.selectedId);}}>
   <div class="w-full space-y-2 sm:w-72"><label for="audit-entity" class="text-sm font-semibold">{copy('Record type','Jenis catatan')}</label><ChoiceSelect id="audit-entity" bind:value={entity} items={auditFilters(ui.locale)} disabled={loading}/></div>
   <Button type="submit" disabled={loading}>{copy('Show activity','Tampilkan aktivitas')}</Button>
   <Button href={endpoint(workspace.selectedId)+'?'+new URLSearchParams({format:'csv',page:String(page),entity})} variant="outline">{copy('Export this page (CSV)','Ekspor halaman ini (CSV)')}</Button>
  </form>
  <ul class="divide-y divide-border">
   {#each items as item(item.id)}
    <li class="space-y-4 py-6 first:pt-0">
     <div class="flex flex-wrap items-start justify-between gap-4">
      <div class="min-w-0 space-y-2">
       <span class="inline-flex rounded-full border border-border bg-muted px-3 py-1 text-xs font-semibold">{auditEntity(item.entity_type,ui.locale)}</span>
       <h2 class="text-base font-semibold leading-relaxed">{auditAction(item.action,ui.locale)}</h2>
       <p class="text-sm text-muted-foreground"><span class="font-semibold">{item.actor??copy('Former member','Mantan anggota')}</span><span aria-hidden="true"> · </span><time datetime={item.created_at}>{formatDateTime(item.created_at,ui.locale)}</time></p>
      </div>
      <Button variant="outline" disabled={loading} aria-expanded={detailId===item.id} aria-controls={'audit-details-'+item.id} onclick={()=>show(item.id)}>{detailId===item.id?copy('Hide details','Sembunyikan detail'):copy('View details','Lihat detail')}</Button>
     </div>
     {#if detailId===item.id}
      <div id={'audit-details-'+item.id} class="space-y-4 rounded-[20px] border-2 border-border bg-muted/40 p-4 sm:p-6" aria-busy={detailLoading}>
       {#if detailLoading}<p role="status" class="text-sm text-muted-foreground">{copy('Loading activity details…','Memuat detail aktivitas…')}</p>
       {:else if detailError}<p role="alert" class="text-sm">{detailError}</p><Button variant="outline" onclick={()=>show(item.id)}>{copy('Try again','Coba lagi')}</Button>
       {:else if details}
        {@const fields=auditFields(details.before,details.after,ui.locale,item.action)}
        {#if fields.length}
         <dl class="divide-y divide-border">
          {#each fields as field(field.key)}
           <div class="grid gap-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:gap-6">
            <dt class="text-sm font-semibold">{field.label}</dt>
            <dd class="min-w-0 space-y-2 break-words text-sm leading-relaxed">
             {#if field.hasBefore}<div><span class="text-muted-foreground">{copy('Before:','Sebelumnya:')} </span>{#if auditMoney(field.key,field.before)}<MoneyDisplay amount={String(field.before)} currency={field.currency}/>{:else}{auditValue(field.before,ui.locale)}{/if}</div>{/if}
             {#if field.hasAfter}<div>{#if field.hasBefore}<span class="text-muted-foreground">{copy('After:','Sesudahnya:')} </span>{/if}{#if auditMoney(field.key,field.after)}<MoneyDisplay amount={String(field.after)} currency={field.currency}/>{:else}{auditValue(field.after,ui.locale)}{/if}</div>{/if}
            </dd>
           </div>
          {/each}
         </dl>
        {:else}<p class="text-sm leading-relaxed">{copy('This activity was recorded without additional change details. Private information and internal tracking codes are hidden from this summary.','Aktivitas ini tercatat tanpa detail perubahan tambahan. Informasi pribadi dan kode pelacakan internal disembunyikan dari ringkasan ini.')}</p>{/if}
        {#if item.action==='send_requested'||item.action==='payment_link_email_requested'}<p class="text-sm text-muted-foreground">{copy('This records a request to send an email. It does not confirm that the email arrived.','Catatan ini menunjukkan permintaan pengiriman email. Ini bukan konfirmasi bahwa email telah diterima.')}</p>{/if}
        {#if item.action==='payment_reversed'||item.action==='reversed'}<p class="text-sm text-muted-foreground">{copy('A recorded entry was reversed. This activity does not itself transfer money back to a customer.','Pencatatan telah dibatalkan. Aktivitas ini sendiri tidak mengirim uang kembali kepada pelanggan.')}</p>{/if}
        <details class="rounded-[14px] border border-border bg-background/60">
         <summary class="min-h-11 cursor-pointer rounded-[14px] px-4 py-3 text-sm text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring">{copy('Technical details (for support)','Detail teknis (untuk bantuan)')}</summary>
         <div class="space-y-3 px-4 pb-4"><p class="break-all text-xs text-muted-foreground">{copy('Activity ID','ID aktivitas')}: {item.id}<br/>{copy('Record ID','ID catatan')}: {item.entity_id}</p>{#if privacy?.hidden}<p class="text-sm text-muted-foreground">{copy('Change data is hidden while privacy mode is on.','Data perubahan disembunyikan saat mode privasi aktif.')}</p>{:else}<pre class="max-h-72 overflow-auto whitespace-pre-wrap break-all text-xs leading-relaxed">{JSON.stringify({before:details.before,after:details.after},null,2)}</pre>{/if}</div>
        </details>
       {/if}
      </div>
     {/if}
    </li>
   {/each}
  </ul>
  {#if !loading&&!error&&!items.length}<div class="space-y-2 rounded-[20px] border-2 border-border bg-muted/40 p-6"><p class="font-semibold">{copy('No activity to show yet','Belum ada aktivitas untuk ditampilkan')}</p><p class="text-sm text-muted-foreground">{entity?copy('Try another record type, or choose all record types.','Coba jenis catatan lain, atau pilih semua jenis catatan.'):copy('Business changes will appear here as your team uses the app.','Perubahan bisnis akan muncul di sini saat tim Anda menggunakan aplikasi.')}</p></div>{/if}
  <nav class="flex flex-wrap items-center justify-between gap-4" aria-label={copy('Activity pages','Halaman aktivitas')}><Button variant="outline" disabled={loading||page<=1} onclick={()=>{page--;void load(workspace.selectedId);}}>{copy('Previous','Sebelumnya')}</Button><span class="text-sm text-muted-foreground" aria-live="polite">{copy('Page','Halaman')} {page}</span><Button variant="outline" disabled={loading||items.length<100} onclick={()=>{page++;void load(workspace.selectedId);}}>{copy('Next','Berikutnya')}</Button></nav>
 </Card.Content>
</Card.Root>
