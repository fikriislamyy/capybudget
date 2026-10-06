<script lang="ts">
 import {getContext,untrack} from 'svelte';import {AUTH_UI_CONTEXT,type AuthUiState} from '$lib/i18n/auth';import {Button} from '$lib/components/ui/button';import {Input} from '$lib/components/ui/input';import ChoiceSelect from '$lib/components/forms/choice-select.svelte';
 let {workspaceId,currency,kind,onCopy,disabled=false}:{workspaceId:string;currency:string;kind:'contacts'|'catalog';onCopy:(item:any)=>void;disabled?:boolean}=$props();
 const ui=getContext<AuthUiState>(AUTH_UI_CONTEXT),copy=(en:string,id:string)=>ui.locale==='id'?id:en,uid=$props.id();
 let search=$state(''),selected=$state(''),items:any[]=$state([]),loading=$state(false),error=$state(''),sequence=0;
 async function load(ws:string, query=search, directoryKind=kind, selectedCurrency=currency){
  const current=++sequence;
  selected='';items=[];error='';
  if(!ws){loading=false;return;}
  loading=true;
  try{
   const response=await fetch('/api/workspaces/'+ws+'/'+directoryKind+'?'+new URLSearchParams({q:query,...(directoryKind==='contacts'?{kind:'customer'}:{})}));
   const result=await response.json();
   if(!response.ok)throw new Error(result.message??copy('Could not search the directory.','Tidak dapat mencari direktori.'));
   if(current===sequence&&ws===workspaceId&&directoryKind===kind&&selectedCurrency===currency)items=result.items.filter((r:any)=>directoryKind==='contacts'||r.currency===selectedCurrency);
  }catch(e){if(current===sequence)error=e instanceof Error?e.message:String(e);}
  finally{if(current===sequence)loading=false;}
 }
 $effect(()=>{
  const ws=workspaceId,directoryKind=kind,selectedCurrency=currency;
  untrack(()=>{search='';void load(ws,'',directoryKind,selectedCurrency);});
  return ()=>{sequence++;};
 });
 const options=$derived([{value:'',label:copy('Select','Pilih')},...items.map(item=>({value:item.id,label:item.name+(item.sku?' · '+item.sku:'')}))]);
 function choose(){const item=items.find(i=>i.id===selected);if(item){onCopy(structuredClone($state.snapshot(item)));selected='';}}
</script>
<div class="mb-4 space-y-2 rounded-[14px] border-2 border-border bg-muted/40 p-4"><label class="text-sm font-semibold" for={uid+'-select'}>{kind==='contacts'?copy('Copy customer details','Salin detail pelanggan'):copy('Copy a catalog item','Salin item katalog')}</label><div class="grid min-w-0 items-end gap-3 lg:grid-cols-2"><div class="flex min-w-0 items-center gap-2"><label class="sr-only" for={uid+'-search'}>{copy('Search directory','Cari direktori')}</label><Input id={uid+'-search'} bind:value={search} disabled={disabled} class="min-w-0 flex-1" maxlength={100} placeholder={kind==='contacts'?copy('Search customer name','Cari nama pelanggan'):copy('Search name or SKU','Cari nama atau SKU')} onkeydown={(event)=>{if(event.key==='Enter'){event.preventDefault();if(disabled||loading||!workspaceId)return;void load(workspaceId);}}}/><Button type="button" variant="outline" class="shrink-0" disabled={disabled||loading||!workspaceId} onclick={()=>load(workspaceId)}>{copy('Search','Cari')}</Button></div><div class="flex min-w-0 items-center gap-2"><ChoiceSelect id={uid+'-select'} bind:value={selected} items={options} disabled={disabled||loading||!workspaceId}/><Button type="button" variant="outline" class="shrink-0" disabled={disabled||loading||!selected} onclick={choose}>{copy('Copy','Salin')}</Button></div></div><p class="text-xs text-muted-foreground">{copy('Copies a snapshot into this draft. Later directory edits do not change it. Search returns up to 50 matches.','Menyalin detail ke draf ini. Edit direktori berikutnya tidak mengubahnya. Pencarian menampilkan hingga 50 hasil.')}</p>{#if error}<p role="alert" class="text-sm">{error}</p>{/if}</div>
