<script lang="ts">
  import { getContext } from 'svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import * as Card from '$lib/components/ui/card';
  import * as Field from '$lib/components/ui/field';
  import { AUTH_UI_CONTEXT, type AuthUiState } from '$lib/i18n/auth';
  import { trackingText } from '$lib/i18n/tracking';
  type State={selectedId:string;ready:boolean};
  type Category={id:string;name:string;type:string;parentId:string|null};
  type Tag={id:string;name:string;color:string|null};
  const workspace=getContext<State>('capybudget-workspaces');
  const authUi=getContext<AuthUiState>(AUTH_UI_CONTEXT);const t=(key:Parameters<typeof trackingText>[1])=>trackingText(authUi.locale,key);
  let categories=$state<Category[]>([]),tags=$state<Tag[]>([]),name=$state(''),type=$state('expense'),parentId=$state(''),tagName=$state(''),error=$state(''),busy=$state(false),reload=$state(0),requestSequence=0;
  $effect(()=>{const id=workspace.selectedId;const key=reload;if(id)void load(id);});
  async function load(id:string){const sequence=++requestSequence;try{const [c,t]=await Promise.all([fetch('/api/workspaces/'+id+'/categories').then(r=>r.json()),fetch('/api/workspaces/'+id+'/tags').then(r=>r.json())]);if(sequence!==requestSequence)return;categories=c.items;tags=t.items;}catch{if(sequence===requestSequence)error='Unable to load categories and tags.';}}
  async function createCategory(e:SubmitEvent){e.preventDefault();if(busy)return;busy=true;error='';try{const r=await fetch('/api/workspaces/'+workspace.selectedId+'/categories',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name,type,parentId:parentId||undefined})});const j=await r.json();if(!r.ok)throw new Error(j.message);name='';parentId='';reload++;}catch(x){error=x instanceof Error?x.message:'Could not add category.';}finally{busy=false;}}
  async function createTag(e:SubmitEvent){e.preventDefault();if(busy)return;busy=true;error='';try{const r=await fetch('/api/workspaces/'+workspace.selectedId+'/tags',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:tagName})});const j=await r.json();if(!r.ok)throw new Error(j.message);tagName='';reload++;}catch(x){error=x instanceof Error?x.message:'Could not add tag.';}finally{busy=false;}}
  async function archive(path:string,id:string){if(!confirm('Archive this item? It will stay visible on past transactions.'))return;try{const r=await fetch(`/api/workspaces/${workspace.selectedId}/${path}/${id}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({archived:true})});const j=await r.json();if(!r.ok)throw new Error(j.message??'Could not archive item.');reload++;}catch(e){error=e instanceof Error?e.message:'Could not archive item.';}}
  async function rename(path:string,id:string,currentName:string){const value=prompt('Name',currentName)?.trim();if(!value||value===currentName)return;try{const r=await fetch(`/api/workspaces/${workspace.selectedId}/${path}/${id}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({name:value})});const j=await r.json();if(!r.ok)throw new Error(j.message??'Could not rename item.');reload++;}catch(e){error=e instanceof Error?e.message:'Could not rename item.';}}
</script>
<p class="eyebrow">MAKE IT YOURS</p><h1>{t('categoryHeading')}</h1><p class="muted">{t('categoryIntro')}</p>
{#if !workspace.ready}<p role="status">{t('loading')}</p>{:else if !workspace.selectedId}<p role="alert">{t('chooseWorkspace')}</p>{:else}
<div class="grid">
  <Card.Root><Card.Header><Card.Title>Categories</Card.Title><Card.Description>Choose a category when you add income or an expense.</Card.Description></Card.Header><Card.Content>
    {#each ['income','expense'] as group}
      <section><h2>{group==='income'?t('income'):t('expenses')}</h2>{#each categories.filter(c=>c.type===group) as category (category.id)}<p class="item">{category.parentId?'↳ ':''}{category.name}<span class="item-actions"><Button variant="ghost" size="sm" onclick={()=>rename('categories',category.id,category.name)}>Edit</Button><Button variant="ghost" size="sm" aria-label="Archive category" onclick={()=>archive('categories',category.id)}>{t('archive')}</Button></span></p>{/each}</section>
    {/each}
    <form onsubmit={createCategory}><Field.FieldGroup>
      <Field.Field><Field.FieldLabel for="category-name">{t('newCategory')}</Field.FieldLabel><Input id="category-name" bind:value={name} maxlength={80} required /></Field.Field>
      <Field.Field><Field.FieldLabel for="category-type">Type</Field.FieldLabel><select id="category-type" bind:value={type}><option value="income">Income</option><option value="expense">Expense</option></select></Field.Field>
      <Field.Field><Field.FieldLabel for="category-parent">{t('parentCategory')}</Field.FieldLabel><select id="category-parent" bind:value={parentId}><option value="">{t('topLevel')}</option>{#each categories.filter(c=>c.type===type&&!c.parentId) as category}<option value={category.id}>{category.name}</option>{/each}</select></Field.Field>
      <Button type="submit" disabled={busy}>{t('addCategory')}</Button>
    </Field.FieldGroup></form>
  </Card.Content></Card.Root>
  <Card.Root><Card.Header><Card.Title>Tags</Card.Title><Card.Description>Use tags such as “work”, “trip”, or “reimbursable”.</Card.Description></Card.Header><Card.Content>
    <div class="tags">{#each tags as tag (tag.id)}<span>{tag.name}<Button variant="ghost" size="sm" onclick={()=>rename('tags',tag.id,tag.name)}>Edit</Button><Button variant="ghost" size="sm" aria-label="Archive tag" onclick={()=>archive('tags',tag.id)}>×</Button></span>{/each}{#if !tags.length}<p class="muted">No tags yet.</p>{/if}</div>
    <form onsubmit={createTag}><Field.FieldGroup><Field.Field><Field.FieldLabel for="tag-name">{t('newTag')}</Field.FieldLabel><Input id="tag-name" bind:value={tagName} maxlength={50} required /></Field.Field><Button type="submit" disabled={busy}>{t('addTag')}</Button></Field.FieldGroup></form>
  </Card.Content></Card.Root>
</div>{/if}
{#if error}<p role="alert" class="error">{error}</p>{/if}
<style>
  .eyebrow{font-size:11px;letter-spacing:1px;font-weight:700;color:var(--muted-foreground);margin:0 0 6px}h1,h2{font-family:'Fredoka Variable',sans-serif;font-weight:500}h1{font-size:34px;margin:0}h2{font-size:18px;margin:16px 0 5px}.muted{color:var(--muted-foreground);margin:7px 0 24px}.grid{display:grid;grid-template-columns:1.2fr .8fr;gap:18px}.item{padding:8px 0;margin:0;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:6px}.item-actions{margin-left:auto;display:flex}.tags{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px}.tags span{border-radius:999px;background:var(--secondary);color:var(--secondary-foreground);padding:6px 12px;display:inline-flex;align-items:center}.error{color:var(--destructive)}select{height:40px;border:1px solid var(--input);border-radius:var(--radius);background:var(--background);color:var(--foreground);padding:0 10px}@media(max-width:750px){.grid{grid-template-columns:1fr}}
</style>
