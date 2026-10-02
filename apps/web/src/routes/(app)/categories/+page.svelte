<script lang="ts">
  import LoadingScope from '$lib/components/shared/loading-scope.svelte';
  import ChoiceSelect from '$lib/components/forms/choice-select.svelte';
  import { Accordion } from 'bits-ui';
  import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
  import { getContext } from 'svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import * as Card from '$lib/components/ui/card';
  import * as Field from '$lib/components/ui/field';
  import * as AlertDialog from '$lib/components/ui/alert-dialog';
  import * as Dialog from '$lib/components/ui/dialog';
  import PlusIcon from '@lucide/svelte/icons/plus';
  import PageHeader from '$lib/components/shared/page-header.svelte';
  import ResponsiveList from '$lib/components/shared/responsive-list.svelte';
  import { AUTH_UI_CONTEXT, type AuthUiState } from '$lib/i18n/auth';
  import { trackingText } from '$lib/i18n/tracking';
  type State={selectedId:string;ready:boolean};
  type Category={id:string;name:string;type:string;parentId:string|null};
  type Tag={id:string;name:string;color:string|null};
  const workspace=getContext<State>('capybudget-workspaces');
  const authUi=getContext<AuthUiState>(AUTH_UI_CONTEXT);const t=(key:Parameters<typeof trackingText>[1])=>trackingText(authUi.locale,key);
  let categories=$state<Category[]>([]),tags=$state<Tag[]>([]),name=$state(''),type=$state('expense'),parentId=$state(''),tagName=$state(''),error=$state(''),busy=$state(false),reload=$state(0),requestSequence=0;
  let categoryFormOpen=$state(false),categoryError=$state('');
  let archiveTarget=$state<{path:string;id:string}|null>(null),renaming=$state<{path:string;id:string}|null>(null),renameValue=$state('');
  $effect(()=>{void (workspace as {revision?:number}).revision;const id=workspace.selectedId;const key=reload;if(id)void load(id);});
  async function load(id:string){const sequence=++requestSequence;try{const [c,tg]=await Promise.all([fetch('/api/workspaces/'+id+'/categories').then(r=>r.json()),fetch('/api/workspaces/'+id+'/tags').then(r=>r.json())]);if(sequence!==requestSequence)return;categories=c.items;tags=tg.items;}catch{if(sequence===requestSequence)error=t('unableCats');}}
  async function createCategory(e:SubmitEvent){e.preventDefault();if(busy)return;busy=true;categoryError='';try{const r=await fetch('/api/workspaces/'+workspace.selectedId+'/categories',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name,type,parentId:parentId||undefined})});const j=await r.json();if(!r.ok)throw new Error(j.message);name='';parentId='';categoryFormOpen=false;reload++;}catch(x){categoryError=x instanceof Error?x.message:t('unableCreateCat');}finally{busy=false;}}
  async function createTag(e:SubmitEvent){e.preventDefault();if(busy)return;busy=true;error='';try{const r=await fetch('/api/workspaces/'+workspace.selectedId+'/tags',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:tagName})});const j=await r.json();if(!r.ok)throw new Error(j.message);tagName='';reload++;}catch(x){error=x instanceof Error?x.message:t('unableCreateTag');}finally{busy=false;}}
  async function confirmArchive(){
    const target=archiveTarget;if(!target)return;
    try{const r=await fetch(`/api/workspaces/${workspace.selectedId}/${target.path}/${target.id}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({archived:true})});const j=await r.json();if(!r.ok)throw new Error(j.message??t('unableArchive'));reload++;}
    catch(e){error=e instanceof Error?e.message:t('unableArchive');}
    finally{archiveTarget=null;}
  }
  function startRename(path:string,id:string,current:string){renaming={path,id};renameValue=current;}
  async function saveRename(){
    const target=renaming;const value=renameValue.trim();if(!target||!value){renaming=null;return;}
    try{const r=await fetch(`/api/workspaces/${workspace.selectedId}/${target.path}/${target.id}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({name:value})});const j=await r.json();if(!r.ok)throw new Error(j.message??t('unableRename'));renaming=null;reload++;}
    catch(e){error=e instanceof Error?e.message:t('unableRename');}
  }
  // Preserve the server's category order within each parent. Children whose
  // parent is no longer visible remain accessible as standalone rows.
  const categoryGroups=$derived.by(()=>{
    const children=new Map<string,Category[]>();
    for(const category of categories){
      if(category.parentId){const siblings=children.get(category.parentId)??[];siblings.push(category);children.set(category.parentId,siblings);}
    }
    return ['income','expense'].map(type=>{
      const rows=categories.filter(category=>category.type===type);
      const ids=new Set(rows.map(category=>category.id));
      return {type,roots:rows.filter(category=>!category.parentId||!ids.has(category.parentId)),children};
    });
  });
  const childCount=(count:number)=>`${count} ${authUi.locale==='id'?'subkategori':count===1?'subcategory':'subcategories'}`;
  const renamingKey=(path:string,id:string)=>renaming?.path===path&&renaming?.id===id;
</script>
{#snippet categoryActions(category:Category)}
  <span class="item-actions">
    <Button variant="ghost" size="sm" aria-label={`${t('rename')}: ${category.name}`} onclick={()=>startRename('categories',category.id,category.name)}>{t('rename')}</Button>
    <Button variant="ghost" size="sm" aria-label={`${t('archive')}: ${category.name}`} onclick={()=>archiveTarget={path:'categories',id:category.id}}>{t('archive')}</Button>
  </span>
{/snippet}
{#snippet renameFields()}
  <div class="rename-row">
    <Input value={renameValue} oninput={(event)=>renameValue=event.currentTarget.value} maxlength={80} aria-label={t('newCategory')} />
    <Button size="sm" onclick={saveRename}>{t('save')}</Button>
    <Button size="sm" variant="ghost" onclick={()=>renaming=null}>{t('cancel')}</Button>
  </div>
{/snippet}
{#snippet categoryRow(category:Category)}
  {#if renamingKey('categories',category.id)}
    {@render renameFields()}
  {:else}
    <div class="item"><span class="item-name">{category.name}</span>{@render categoryActions(category)}</div>
  {/if}
{/snippet}
<LoadingScope active={busy} />

<PageHeader eyebrow={authUi.locale==='id'?'SESUAI GAYAMU':'MAKE IT YOURS'} title={t('categoryHeading')} description={t('categoryIntro')} />
{#if !workspace.ready}<p role="status">{t('loading')}</p>{:else if !workspace.selectedId}<p role="alert">{t('chooseWorkspace')}</p>{:else}
<div class="grid">
  <Dialog.Root bind:open={categoryFormOpen} onOpenChange={(open)=>{if(open)categoryError='';}}>
  <Card.Root><Card.Header class="category-card-header"><Card.Title>{t('catsTitle')}</Card.Title><Card.Description>{t('catsHint')}</Card.Description><Card.Action class="category-add-action">
    <Dialog.Trigger>
      {#snippet child({ props })}<Button {...props} type="button" disabled={busy}><PlusIcon data-icon="inline-start" aria-hidden="true" />{t('addCategory')}</Button>{/snippet}
    </Dialog.Trigger>
  </Card.Action></Card.Header><Card.Content>
    {#key workspace.selectedId}
    {#each categoryGroups as group (group.type)}
      <section aria-label={group.type==='income'?t('income'):t('expenses')}>
        <h2>{group.type==='income'?t('income'):t('expenses')}</h2>
        {#if group.roots.length}
          <Accordion.Root type="multiple">
            <ResponsiveList label={group.type==='income'?t('income'):t('expenses')}>
              {#each group.roots as category (category.id)}
                {@const childRows=group.children.get(category.id)??[]}
                <li>
                  {#if childRows.length}
                    <Accordion.Item value={category.id} class="category-group">
                      <div class="parent-row">
                        <Accordion.Header level={3} class="category-header">
                          <Accordion.Trigger class="category-trigger">
                            <span class="parent-label"><span class="item-name">{category.name}</span><span class="child-count">{childCount(childRows.length)}</span></span>
                            <ChevronDownIcon class="category-chevron" aria-hidden="true" />
                            <span class="sr-only">{t('toggleSubcategories')}</span>
                          </Accordion.Trigger>
                        </Accordion.Header>
                        {#if !renamingKey('categories',category.id)}{@render categoryActions(category)}{/if}
                      </div>
                      {#if renamingKey('categories',category.id)}{@render renameFields()}{/if}
                      <Accordion.Content class="category-panel">
                        <ResponsiveList label={`${category.name}: ${t('subcategories')}`}>
                          {#each childRows as child (child.id)}
                            <li>{@render categoryRow(child)}</li>
                          {/each}
                        </ResponsiveList>
                      </Accordion.Content>
                    </Accordion.Item>
                  {:else}
                    {@render categoryRow(category)}
                  {/if}
                </li>
              {/each}
            </ResponsiveList>
          </Accordion.Root>
        {/if}
      </section>
    {/each}
    {/key}
  </Card.Content></Card.Root>
  <Dialog.Content class="category-create-dialog" showCloseButton={!busy} onEscapeKeydown={(event)=>{if(busy)event.preventDefault();}} onInteractOutside={(event)=>{if(busy)event.preventDefault();}}>
    <Dialog.Header><Dialog.Title>{t('addCategory')}</Dialog.Title><Dialog.Description>{t('categoryFormHint')}</Dialog.Description></Dialog.Header>
    <form onsubmit={createCategory}><Field.FieldGroup>
      <Field.Field><Field.FieldLabel for="category-name">{t('newCategory')}</Field.FieldLabel><Input id="category-name" bind:value={name} maxlength={80} required disabled={busy} /></Field.Field>
      <Field.Field><Field.FieldLabel for="category-type">{t('typeLabel')}</Field.FieldLabel><ChoiceSelect id="category-type" bind:value={type} disabled={busy} onValueChange={()=>parentId=''} items={[{value: "income", label: String(t('typeIncome'))}, {value: "expense", label: String(t('typeExpense'))}]} /></Field.Field>
      <Field.Field><Field.FieldLabel for="category-parent">{t('parentCategory')}</Field.FieldLabel><ChoiceSelect id="category-parent" bind:value={parentId} disabled={busy} items={[{value: '', label: String(t('topLevel'))}, ...(categories.filter(c=>c.type===type&&!c.parentId)).flatMap((category) => [{value: category.id, label: String(category.name)}])]} /></Field.Field>
    </Field.FieldGroup>
      {#if categoryError}<p role="alert" class="error category-form-error">{categoryError}</p>{/if}
      <Dialog.Footer class="category-form-footer">
        <Dialog.Close>
          {#snippet child({ props })}<Button {...props} type="button" variant="outline" disabled={busy}>{t('cancel')}</Button>{/snippet}
        </Dialog.Close>
        <Button type="submit" disabled={busy} aria-busy={busy}>{busy?t('saving'):t('addCategory')}</Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
  </Dialog.Root>
  <Card.Root><Card.Header><Card.Title>{t('tagsTitle')}</Card.Title><Card.Description>{t('tagsAbout')}</Card.Description></Card.Header><Card.Content>
    <div class="tags">
      {#each tags as tag (tag.id)}
        {#if renamingKey('tags',tag.id)}
          <span class="tag-edit"><Input value={renameValue} oninput={(e)=>renameValue=e.currentTarget.value} maxlength={50} aria-label={t('newTag')} /><Button size="sm" onclick={saveRename}>{t('save')}</Button><Button size="sm" variant="ghost" onclick={()=>renaming=null}>{t('cancel')}</Button></span>
        {:else}
          <span class="tag">{tag.name}<Button variant="ghost" size="sm" onclick={()=>startRename('tags',tag.id,tag.name)}>{t('rename')}</Button><Button variant="ghost" size="sm" aria-label="{t('archive')}: {tag.name}" onclick={()=>archiveTarget={path:'tags',id:tag.id}}>×</Button></span>
        {/if}
      {/each}
      {#if !tags.length}<p class="muted">{t('noTags')}</p>{/if}
    </div>
    <form onsubmit={createTag}><Field.FieldGroup><Field.Field><Field.FieldLabel for="tag-name">{t('newTag')}</Field.FieldLabel><Input id="tag-name" bind:value={tagName} maxlength={50} required /></Field.Field><Button type="submit" disabled={busy}>{busy?t('saving'):t('addTag')}</Button></Field.FieldGroup></form>
  </Card.Content></Card.Root>
</div>
<AlertDialog.Root open={!!archiveTarget} onOpenChange={(v)=>{if(!v)archiveTarget=null;}}>
  <AlertDialog.Content>
    <AlertDialog.Header><AlertDialog.Title>{t('archiveTitle')}</AlertDialog.Title><AlertDialog.Description>{t('archiveBody')}</AlertDialog.Description></AlertDialog.Header>
    <AlertDialog.Footer><AlertDialog.Cancel onclick={()=>archiveTarget=null}>{t('cancel')}</AlertDialog.Cancel><AlertDialog.Action onclick={confirmArchive}>{t('archive')}</AlertDialog.Action></AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
{/if}
{#if error}<p role="alert" class="error">{error}</p>{/if}
<style>
  h2{font-family:var(--font-heading);font-weight:500;font-size:18px;margin:16px 0 4px}
  section:first-of-type h2{margin-top:0}
  .muted{color:var(--muted-foreground)}
  .grid{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,.8fr);gap:16px;align-items:start}
  .item{margin:0;display:flex;align-items:center;gap:8px;min-width:0}
  .item-name{flex:1;min-width:0;overflow-wrap:anywhere}
  .item-actions{margin-left:auto;display:flex;flex-shrink:0}
  .rename-row{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
  .rename-row :global([data-slot="input"]){flex:1;min-width:120px}
  .parent-row{display:flex;align-items:center;gap:8px;min-width:0}
  :global(.category-header){flex:1;min-width:0;margin:0}
  :global(.category-trigger){display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;min-height:44px;padding:8px;border-radius:var(--radius-input);background:transparent;text-align:left;color:var(--foreground);cursor:pointer;transition:background-color 160ms ease-out}
  :global(.category-trigger:hover){background:var(--secondary)}
  :global(.category-trigger:focus-visible){outline:2px solid var(--ring);outline-offset:2px}
  .parent-label{display:flex;flex-direction:column;gap:4px;min-width:0}
  .parent-label .item-name{font-weight:600;font-size:14px}
  .child-count{font-size:12px;font-weight:400;color:var(--muted-foreground)}
  :global(.category-chevron){width:16px;height:16px;flex-shrink:0;color:var(--brand-ink);transition:transform 160ms ease-out}
  :global(.category-trigger[data-state="open"] .category-chevron){transform:rotate(180deg)}
  :global(.category-panel){padding:8px 0 0 16px}
  :global(.category-panel[data-state="closed"]){display:none}
  :global(.category-panel[data-state="open"]){animation:category-reveal 180ms ease-out}
  .item-actions :global([data-slot="button"]){min-width:44px;min-height:44px}
  @keyframes category-reveal{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
  @media(prefers-reduced-motion:reduce){:global(.category-trigger),:global(.category-chevron){transition:none}:global(.category-panel[data-state="open"]){animation:none}}
  .tags{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px}
  .tag{border-radius:999px;background:var(--secondary);color:var(--secondary-foreground);padding:4px 4px 4px 12px;display:inline-flex;align-items:center;gap:2px}
  .tag-edit{display:flex;gap:4px;align-items:center;flex:1;min-width:200px}
  .error{color:var(--destructive)}
  :global(.category-card-header [data-slot="card-description"]){grid-column:1 / -1}
  :global(.category-add-action){grid-row:1 / 2}
  :global(.category-create-dialog){max-width:calc(100vw - 32px);width:480px;max-height:calc(100dvh - 32px);overflow-y:auto;padding:24px}
  :global(.category-create-dialog [data-slot="dialog-header"]){padding-right:24px;text-align:left}
  :global(.category-form-footer){margin-top:24px;gap:8px}
  .category-form-error{margin:16px 0 0}
  @media(max-width:480px){:global(.category-create-dialog){padding:16px}}
  @media(prefers-reduced-motion:reduce){:global(.category-create-dialog){animation:none!important}}
  @media(max-width:750px){.grid{grid-template-columns:minmax(0,1fr)}}
</style>
