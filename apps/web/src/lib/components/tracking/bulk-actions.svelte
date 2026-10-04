<script lang="ts">
 import {getContext} from 'svelte';
 import {AUTH_UI_CONTEXT,type AuthUiState} from '$lib/i18n/auth';
 import {Button} from '$lib/components/ui/button';
 import * as Dialog from '$lib/components/ui/dialog';
 import ChoiceSelect from '$lib/components/forms/choice-select.svelte';
 import DatePicker from '$lib/components/forms/date-picker.svelte';
 import LoadingScope from '$lib/components/shared/loading-scope.svelte';
 import MoneyDisplay from '$lib/components/shared/money-display.svelte';
 let {workspaceId,items,selected=$bindable([]),categories,tags,onUpdated}:{workspaceId:string;items:{id:string;version:number;amount:string;currency:string;type:string}[];selected?:string[];categories:{id:string;name:string;type:string}[];tags:{id:string;name:string}[];onUpdated:()=>void}=$props();
 const ui=getContext<AuthUiState>(AUTH_UI_CONTEXT),copy=(en:string,id:string)=>ui.locale==='id'?id:en;
 let open=$state(false),action=$state('delete'),categoryId=$state(''),date=$state(''),tagIds=$state<string[]>([]),replaceTags=$state(false),busy=$state(false),error=$state(''),preview=$state<any>(null),undo=$state<{id:string;version:number}[]>([]);
 $effect(()=>{const ws=workspaceId;selected=[];undo=[];preview=null;open=false;});
 async function request(path:string,body:unknown){const r=await fetch(`/api/workspaces/${workspaceId}/bulk/${path}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const j=await r.json();if(!r.ok)throw new Error(j.message);return j;}
 async function review(){busy=true;error='';try{preview=await request('preview',{action,items:items.filter(x=>selected.includes(x.id)).map(({id,version})=>({id,version})),changes:action==='edit'?{...(categoryId?{categoryId}:{}),...(date?{date}:{}),...(replaceTags?{tagIds}:{} )}:{}});}catch(e){error=(e as Error).message;}finally{busy=false;}}
 async function apply(){busy=true;error='';try{const result=await request(`${preview.operationId}/apply`,{});undo=result.action==='delete'?result.items:[];selected=[];preview=null;open=false;onUpdated();}catch(e){error=(e as Error).message;}finally{busy=false;}}
 async function restore(){busy=true;error='';try{const result=await request('preview',{action:'restore',items:undo});await request(`${result.operationId}/apply`,{});undo=[];onUpdated();}catch(e){error=(e as Error).message;}finally{busy=false;}}
</script>
<LoadingScope active={busy}/>
<div class="actions">
 <Button variant="outline" disabled={!items.length} onclick={()=>selected=selected.length?[]:items.slice(0,100).map(x=>x.id)}>{selected.length?copy('Clear selection','Hapus pilihan'):copy('Select this page','Pilih halaman ini')}</Button>
 {#if selected.length}<Button variant="secondary" onclick={()=>{preview=null;open=true;}}>{copy('Bulk actions','Tindakan massal')} ({selected.length}/100)</Button>{/if}
 {#if undo.length}<Button variant="outline" onclick={restore}>{copy('Restore deleted batch','Pulihkan transaksi yang dihapus')}</Button>{/if}
 <Button variant="ghost" href="/imports">{copy('Import & scan','Impor & pindai')}</Button>
</div>
{#if error}<p role="alert" class="error">{error}</p>{/if}
<Dialog.Root bind:open><Dialog.Content><Dialog.Header><Dialog.Title>{copy('Review your selected transactions','Tinjau transaksi pilihan')}</Dialog.Title><Dialog.Description>{copy('The whole batch is applied together. If a record changed, refresh and review again.','Seluruh perubahan diterapkan bersama. Jika transaksi berubah, muat ulang dan tinjau lagi.')}</Dialog.Description></Dialog.Header>
 {#if !preview}
 <label for="bulk-action">{copy('Action','Tindakan')}</label><ChoiceSelect id="bulk-action" bind:value={action} items={[{value:'delete',label:copy('Delete','Hapus')},{value:'edit',label:copy('Edit','Ubah')}]} />
 {#if action==='edit'}
 <label for="bulk-date">{copy('New date (optional)','Tanggal baru (opsional)')}</label><DatePicker id="bulk-date" bind:value={date}/>
 <label for="bulk-category">{copy('New category (optional)','Kategori baru (opsional)')}</label><ChoiceSelect id="bulk-category" bind:value={categoryId} items={[{value:'',label:copy('Keep categories','Pertahankan kategori')},...categories.map(x=>({value:x.id,label:x.name}))]}/>
 <label for="bulk-tags">{copy('Replace tags (optional)','Ganti tag (opsional)')}</label><ChoiceSelect id="bulk-tags" multiple bind:value={tagIds} items={tags.map(x=>({value:x.id,label:x.name}))}/>
 <Button variant={replaceTags?'secondary':'outline'} aria-pressed={replaceTags} onclick={()=>replaceTags=!replaceTags}>{copy('Apply selected tags, including an empty selection','Terapkan tag pilihan, termasuk pilihan kosong')}</Button>
 {/if}
 <Button disabled={busy} onclick={review}>{copy('Preview changes','Pratinjau perubahan')}</Button>
 {:else}
 <p>{copy('Transactions affected','Transaksi yang terpengaruh')}: {preview.count} · {preview.action}</p>
 <div class="preview capy-scrollbar">{#each preview.items as item (item.id)}<div><span>{item.type}</span><MoneyDisplay amount={item.amount} currency={item.currency}/></div>{/each}</div>
 <p>{copy('Confirm to apply these changes to all selected records.','Konfirmasi untuk menerapkan perubahan pada semua transaksi pilihan.')}</p>
 <Button variant="outline" onclick={()=>preview=null}>{copy('Back','Kembali')}</Button><Button disabled={busy} onclick={apply}>{copy('Confirm batch','Konfirmasi perubahan')}</Button>
 {/if}
</Dialog.Content></Dialog.Root>
<style>.actions{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px}.preview{max-height:240px;overflow:auto;display:grid;gap:12px}.preview>div{display:flex;justify-content:space-between;gap:16px;padding:8px;border-bottom:2px solid var(--border)}.error{color:var(--expense-ink)}</style>
