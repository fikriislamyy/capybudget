<script lang="ts">
  import {getContext as privacyContext} from 'svelte';
  import {concealed,PRIVACY_CONTEXT,type PrivacyState} from '$lib/privacy';
  const privacy=privacyContext<PrivacyState>(PRIVACY_CONTEXT);
  import { getContext } from 'svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import * as Card from '$lib/components/ui/card';
  import * as Field from '$lib/components/ui/field';
  import { AUTH_UI_CONTEXT, type AuthUiState } from '$lib/i18n/auth';
  import { trackingText } from '$lib/i18n/tracking';

  type State={selectedId:string;ready:boolean};
  type Account={id:string;name:string;kind:string;currency:string};
  type Category={id:string;name:string;type:string};
  type Tag={id:string;name:string};
  type Attachment={id:string;name:string;mimeType:string};
  type Tx={id:string;accountId:string;destinationAccountId?:string;categoryId?:string;type:string;accountName:string;destinationAccountName?:string;categoryName?:string;amount:string;currency:string;date:string;notes?:string;merchant?:string;version:number;tags:Tag[];attachments?:Attachment[]};
  const workspace=getContext<State>('capybudget-workspaces');
  const authUi=getContext<AuthUiState>(AUTH_UI_CONTEXT);const t=(key:Parameters<typeof trackingText>[1])=>trackingText(authUi.locale,key);
  let accounts=$state<Account[]>([]),categories=$state<Category[]>([]),tags=$state<Tag[]>([]),items=$state<Tx[]>([]),deleted=$state<Tx[]>([]),editing=$state<Tx|null>(null),showDeleted=$state(false);
  let txType=$state('expense'),accountId=$state(''),destinationAccountId=$state(''),categoryId=$state(''),amount=$state(''),date=$state(today()),notes=$state(''),merchant=$state(''),tagIds=$state<string[]>([]);
  let query=$state(''),appliedQuery=$state(''),typeFilter=$state(''),from=$state(''),to=$state(''),sort=$state('date'),accountFilter=$state(''),categoryFilter=$state(''),tagFilter=$state(''),minAmount=$state(''),maxAmount=$state(''),cursor=$state(''),nextCursor=$state(''),busy=$state(false),loading=$state(true),loadingMore=$state(false),error=$state(''),notice=$state('');
  let refresh=$state(0),timer:ReturnType<typeof setTimeout>,previousWorkspace='',requestSequence=0;
  let categorySuggestion=$state<{categoryId:string;categoryName:string;source:string;reason:string}|null>(null),suggestionSequence=0;
  $effect(()=>{void (workspace as {revision?:number}).revision;const id=workspace.selectedId,type=txType,merchantValue=merchant;if(!id||!merchantValue.trim()||!['income','expense'].includes(type)){categorySuggestion=null;return;}const sequence=++suggestionSequence;const delay=setTimeout(async()=>{try{const response=await fetch(`/api/workspaces/${id}/assistant/categorize`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type,merchant:merchantValue,selectedCategoryId:categoryId||null})});const body=await response.json();if(sequence===suggestionSequence)categorySuggestion=body.suggestion??null;}catch{if(sequence===suggestionSequence)categorySuggestion=null;}},250);return()=>clearTimeout(delay);});
  function today(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta'}).format(new Date());}
  $effect(()=>{void (workspace as {revision?:number}).revision;const id=workspace.selectedId;const key=refresh;if(id&&previousWorkspace&&id!==previousWorkspace){accountId='';destinationAccountId='';categoryId='';tagIds=[];accountFilter='';categoryFilter='';tagFilter='';cursor='';items=[];editing=null;}if(id)previousWorkspace=id;const filters={search:appliedQuery,kind:typeFilter,start:from,end:to,order:sort,account:accountFilter,category:categoryFilter,tag:tagFilter,min:minAmount,max:maxAmount,after:cursor};if(id)void load(id,filters);});
  type Filters={search:string;kind:string;start:string;end:string;order:string;account:string;category:string;tag:string;min:string;max:string;after:string};
  async function load(id:string,filters:Filters){
    const sequence=++requestSequence;loading=true;error='';
    try{
      const [a,c,t,d]=await Promise.all([fetch('/api/workspaces/'+id+'/accounts').then(r=>r.json()),fetch('/api/workspaces/'+id+'/categories').then(r=>r.json()),fetch('/api/workspaces/'+id+'/tags').then(r=>r.json()),fetch('/api/workspaces/'+id+'/transactions/deleted').then(r=>r.json())]);
      accounts=a.items;categories=c.items;tags=t.items;deleted=d.items;
      if(sequence!==requestSequence)return;
      if(!accountId&&accounts.length)accountId=accounts[0].id;
      const params=new URLSearchParams();if(filters.search)params.set('q',filters.search);if(filters.kind)params.set('type',filters.kind);if(filters.start)params.set('from',filters.start);if(filters.end)params.set('to',filters.end);if(filters.account)params.set('accountIds',filters.account);if(filters.category)params.set('categoryIds',filters.category);if(filters.tag)params.set('tagIds',filters.tag);if(filters.min)params.set('minAmount',filters.min);if(filters.max)params.set('maxAmount',filters.max);params.set('sort',filters.order);if(filters.after)params.set('cursor',filters.after);
      const r=await fetch('/api/workspaces/'+id+'/transactions?'+params);const j=await r.json();if(sequence!==requestSequence)return;if(!r.ok)throw new Error(j.message??'Unable to load transactions.');items=filters.after?[...items,...j.items]:j.items;nextCursor=j.nextCursor??'';
    }catch(e){if(sequence===requestSequence)error=e instanceof Error?e.message:'Unable to load transactions.';}
    finally{if(sequence===requestSequence){loading=false;loadingMore=false;}}
  }
  function applyFilters(){cursor='';appliedQuery=query;refresh++;}
  function searchChanged(value:string){query=value;clearTimeout(timer);timer=setTimeout(()=>{cursor='';appliedQuery=value;refresh++;},250);}
  function loadMore(){if(!nextCursor||loadingMore)return;loadingMore=true;cursor=nextCursor;}
  async function create(event:SubmitEvent){
    event.preventDefault();if(busy||!workspace.selectedId)return;busy=true;error='';notice='';
    const payload:any={type:txType,accountId,amount,date,notes,merchant,tagIds};
    if(txType==='transfer')payload.destinationAccountId=destinationAccountId;else payload.categoryId=categoryId;
    try{
      const target=editing?'/api/workspaces/'+workspace.selectedId+'/transactions/'+editing.id+'?version='+editing.version:'/api/workspaces/'+workspace.selectedId+'/transactions';
      const response=await fetch(target,{method:editing?'PATCH':'POST',headers:{'content-type':'application/json',...(editing?{}:{'idempotency-key':crypto.randomUUID()})},body:JSON.stringify(payload)});
      const result=await response.json();if(!response.ok)throw new Error(result.message??'Unable to save transaction.');
      amount='';notes='';merchant='';tagIds=[];date=today();editing=null;notice='Transaction saved.';refresh++;
    }catch(e){error=e instanceof Error?e.message:'Unable to save transaction.';}
    finally{busy=false;}
  }
  async function remove(item:Tx){
    if(!confirm('Delete this transaction? Its account balance will be reversed.'))return;
    error='';notice='';
    try{const r=await fetch('/api/workspaces/'+workspace.selectedId+'/transactions/'+item.id+'?version='+item.version,{method:'DELETE'});if(!r.ok){const j=await r.json();throw new Error(j.message??'Unable to delete transaction.');}notice='Transaction deleted.';refresh++;}
    catch(e){error=e instanceof Error?e.message:'Unable to delete transaction.';}
  }
  function edit(item:Tx){editing=item;txType=item.type;accountId=item.accountId;destinationAccountId=item.destinationAccountId??'';categoryId=item.categoryId??'';amount=item.amount;date=item.date;notes=item.notes??'';merchant=item.merchant??'';tagIds=item.tags.map(t=>t.id);window.scrollTo({top:0,behavior:'smooth'});}
  async function restore(item:Tx){try{const r=await fetch(`/api/workspaces/${workspace.selectedId}/transactions/${item.id}/restore`,{method:'POST'});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.message??'Unable to restore transaction.');notice='Transaction restored.';refresh++;}catch(e){error=e instanceof Error?e.message:'Unable to restore transaction.';}}
  async function uploadAttachment(item:Tx,event:Event){const input=event.currentTarget as HTMLInputElement,file=input.files?.[0];if(!file)return;error='';try{const r=await fetch(`/api/workspaces/${workspace.selectedId}/transactions/${item.id}/attachments?name=${encodeURIComponent(file.name)}`,{method:'POST',headers:{'content-type':file.type},body:file});const j=await r.json();if(!r.ok)throw new Error(j.message??'Unable to upload receipt.');notice='Receipt attached.';refresh++;}catch(e){error=e instanceof Error?e.message:'Unable to upload receipt.';}finally{input.value='';}}
  async function removeAttachment(id:string){try{const r=await fetch(`/api/workspaces/${workspace.selectedId}/attachments/${id}`,{method:'DELETE'});if(!r.ok)throw new Error('Unable to remove receipt.');refresh++;}catch(e){error=e instanceof Error?e.message:'Unable to remove receipt.';}}
</script>

<div class="heading"><div><p class="eyebrow">EVERYDAY TRACKING</p><h1>{t('transactionHeading')}</h1><p class="muted">{t('transactionIntro')}</p></div></div>
{#if !workspace.ready}<p role="status">{t('loading')}</p>{:else if !workspace.selectedId}<p role="alert">{t('chooseWorkspace')}</p>{:else}
  <div class="layout">
    <Card.Root class="entry"><Card.Header><Card.Title>{t('quickAdd')}</Card.Title><Card.Description>Log a transaction with the essentials. Amounts stay in {accounts.find(a=>a.id===accountId)?.currency??'your workspace currency'}.</Card.Description></Card.Header>
      <Card.Content><form onsubmit={create}><Field.FieldGroup>
        <Field.Field><Field.FieldLabel for="tx-type">Type</Field.FieldLabel><select id="tx-type" bind:value={txType} onchange={()=>{categoryId='';destinationAccountId='';}}><option value="expense">Expense</option><option value="income">Income</option><option value="transfer">Transfer</option></select></Field.Field>
        <Field.Field><Field.FieldLabel for="amount">{t('amount')}</Field.FieldLabel><Input id="amount"  type={privacy.hidden?'password':'text'} bind:value={amount} inputmode="decimal" placeholder="0.00" required /></Field.Field>
        <Field.Field><Field.FieldLabel for="account">{t('account')}</Field.FieldLabel><select id="account" bind:value={accountId} required><option value="">Choose an account</option>{#each accounts as account (account.id)}<option value={account.id}>{account.name}</option>{/each}</select></Field.Field>
        {#if txType==='transfer'}
          <Field.Field><Field.FieldLabel for="destination">To account</Field.FieldLabel><select id="destination" bind:value={destinationAccountId} required><option value="">Choose a destination</option>{#each accounts.filter(a=>a.id!==accountId) as account (account.id)}<option value={account.id}>{account.name}</option>{/each}</select></Field.Field>
        {:else}
          <Field.Field><Field.FieldLabel for="category">{t('category')}</Field.FieldLabel><select id="category" bind:value={categoryId} required><option value="">Choose a category</option>{#each categories.filter(c=>c.type===txType) as category (category.id)}<option value={category.id}>{category.name}</option>{/each}</select>{#if categorySuggestion&&categorySuggestion.categoryId!==categoryId}<Field.FieldDescription>{t('categorySuggestion').replace('{category}',categorySuggestion.categoryName)} {t(categorySuggestion.source==='explicit_rule'?'categorySuggestionExplicit':'categorySuggestionLearned')} <Button type="button" variant="link" size="sm" onclick={()=>categoryId=categorySuggestion!.categoryId}>{t('useSuggestion')}</Button></Field.FieldDescription>{/if}</Field.Field>
        {/if}
        <Field.Field><Field.FieldLabel for="tx-date">{t('date')}</Field.FieldLabel><Input id="tx-date" type="date" bind:value={date} required /></Field.Field>
        <Field.Field><Field.FieldLabel for="merchant">{t('merchant')}</Field.FieldLabel><Input id="merchant" bind:value={merchant} maxlength={200} /></Field.Field>
        <Field.Field><Field.FieldLabel for="notes">{t('note')}</Field.FieldLabel><Input id="notes" bind:value={notes} maxlength={2000} placeholder="What was this for?" /></Field.Field>
        {#if tags.length}<Field.Field><Field.FieldLabel for="tags">Tags (optional)</Field.FieldLabel><select id="tags" multiple bind:value={tagIds}>{#each tags as tag (tag.id)}<option value={tag.id}>{tag.name}</option>{/each}</select><Field.FieldDescription>Use Ctrl or Command to select more than one.</Field.FieldDescription></Field.Field>{/if}
        {#if error}<p class="error" role="alert">{error}</p>{/if}{#if notice}<p class="notice" role="status">{notice}</p>{/if}
        {#if editing}<p class="notice">Editing transaction. Journal history will remain auditable.</p><Button type="button" variant="outline" onclick={()=>editing=null}>{t('cancel')}</Button>{/if}<Button type="submit" disabled={busy||accounts.length===0}>{busy?t('saving'):editing?t('saveChanges'):t('saveTransaction')}</Button>
      </Field.FieldGroup></form></Card.Content>
    </Card.Root>
    <Card.Root class="history"><Card.Header><Card.Title>{t('history')}</Card.Title><Card.Description>Search and narrow the records in this workspace.</Card.Description></Card.Header><Card.Content>
      <div class="filters"><Field.Field><Field.FieldLabel for="search">{t('search')}</Field.FieldLabel><Input id="search" value={query} oninput={(e)=>searchChanged(e.currentTarget.value)} placeholder={t('search')} /></Field.Field>
        <div class="filter-row"><Field.Field><Field.FieldLabel for="filter-type">Type</Field.FieldLabel><select id="filter-type" bind:value={typeFilter} onchange={applyFilters}><option value="">All</option><option value="income">Income</option><option value="expense">Expense</option><option value="transfer">Transfer</option></select></Field.Field>
        <Field.Field><Field.FieldLabel for="from">From</Field.FieldLabel><Input id="from" type="date" bind:value={from} onchange={applyFilters} /></Field.Field>
        <Field.Field><Field.FieldLabel for="to">To</Field.FieldLabel><Input id="to" type="date" bind:value={to} onchange={applyFilters} /></Field.Field></div>
        <Field.Field><Field.FieldLabel for="account-filter">Account</Field.FieldLabel><select id="account-filter" bind:value={accountFilter} onchange={applyFilters}><option value="">All accounts</option>{#each accounts as account (account.id)}<option value={account.id}>{account.name}</option>{/each}</select></Field.Field>
        <Field.Field><Field.FieldLabel for="category-filter">Category</Field.FieldLabel><select id="category-filter" bind:value={categoryFilter} onchange={applyFilters}><option value="">All categories</option>{#each categories as category (category.id)}<option value={category.id}>{category.name}</option>{/each}</select></Field.Field>
        <Field.Field><Field.FieldLabel for="tag-filter">Tag</Field.FieldLabel><select id="tag-filter" bind:value={tagFilter} onchange={applyFilters}><option value="">All tags</option>{#each tags as tag (tag.id)}<option value={tag.id}>{tag.name}</option>{/each}</select></Field.Field>
        <div class="filter-row"><Field.Field><Field.FieldLabel for="minimum">Minimum amount</Field.FieldLabel><Input id="minimum"  type={privacy.hidden?'password':'text'} bind:value={minAmount} inputmode="decimal" oninput={applyFilters} /></Field.Field><Field.Field><Field.FieldLabel for="maximum">Maximum amount</Field.FieldLabel><Input id="maximum"  type={privacy.hidden?'password':'text'} bind:value={maxAmount} inputmode="decimal" oninput={applyFilters} /></Field.Field></div>
        <Field.Field><Field.FieldLabel for="sort">Sort by</Field.FieldLabel><select id="sort" bind:value={sort} onchange={applyFilters}><option value="date">Date</option><option value="amount">Amount</option><option value="category">Category</option><option value="tag">Tag</option></select></Field.Field>
      </div>
      {#if loading}<p role="status">Loading transactions…</p>{:else if items.length===0}<div class="empty"><span aria-hidden="true">◌</span><strong>No transactions found</strong><p>Add one above or adjust your filters.</p></div>
      {:else}<div class="rows">{#each items as item (item.id)}<article class="row"><span class="type-icon" class:income={item.type==='income'} class:expense={item.type==='expense'} aria-label={item.type}>{item.type==='income'?'↗':item.type==='expense'?'↘':'↔'}</span><div class="description"><strong>{item.merchant||item.notes||item.type}</strong><small>{item.type==='transfer'?item.accountName+' → '+item.destinationAccountName:item.categoryName+' · '+item.accountName} · {item.date}</small>{#if item.tags?.length}<small class="tag-list">{item.tags.map(t=>t.name).join(' · ')}</small>{/if}{#if item.attachments?.length}<div class="attachment-list">{#each item.attachments as attachment}<a href={`/api/workspaces/${workspace.selectedId}/attachments/${attachment.id}/download`}>{attachment.name}</a><button type="button" aria-label="Remove receipt" onclick={()=>removeAttachment(attachment.id)}>×</button>{/each}</div>{/if}<label class="upload">Attach receipt<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onchange={(e)=>uploadAttachment(item,e)} /></label></div><strong class="amount" class:positive={item.type==='income'} class:negative={item.type==='expense'}>{item.currency} {item.type==='expense'?'-':''}{concealed(item.amount,privacy.hidden)}</strong><div class="actions"><Button variant="ghost" size="sm" aria-label="Edit transaction" onclick={()=>edit(item)}>✎</Button><Button variant="ghost" size="sm" aria-label="Delete transaction" onclick={()=>remove(item)}>×</Button></div></article>{/each}</div>{#if nextCursor}<Button variant="outline" class="more" onclick={loadMore} disabled={loadingMore}>{loadingMore?'Loading…':'Load more'}</Button>{/if}{/if}
      <Button variant="outline" class="deleted-toggle" onclick={()=>showDeleted=!showDeleted}>{showDeleted?t('hideDeleted'):t('showDeleted')}</Button>
      {#if showDeleted}<div class="rows deleted-list">{#each deleted as item (item.id)}<article class="deleted-row"><span>{item.merchant||item.notes||item.type} · {item.date}</span><strong>{item.currency} {concealed(item.amount,privacy.hidden)}</strong><Button size="sm" variant="outline" onclick={()=>restore(item)}>{t('restore')}</Button></article>{/each}</div>{/if}
    </Card.Content></Card.Root>
  </div>
{/if}

<style>
  .heading{margin-bottom:24px}.eyebrow{font-size:11px;letter-spacing:1px;font-weight:700;color:var(--muted-foreground);margin:0 0 6px}h1{font:500 34px 'Fredoka Variable',sans-serif;margin:0}.muted{color:var(--muted-foreground);margin:7px 0 0}.layout{display:grid;grid-template-columns:minmax(270px,.8fr) minmax(0,1.4fr);gap:18px;align-items:start}.filters{display:grid;gap:12px}.filter-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.rows{margin-top:16px}.row{display:grid;grid-template-columns:38px minmax(0,1fr) auto auto;align-items:center;gap:9px;padding:12px 0;border-bottom:1px solid var(--border)}.row:last-child{border:0}.type-icon{display:grid;place-items:center;width:36px;height:36px;border-radius:12px;background:var(--secondary);color:var(--secondary-foreground);font-size:18px}.type-icon.income{color:#2F7A2A}.type-icon.expense{color:#C7473A}.description{min-width:0;display:grid;gap:3px}.description strong,.amount{font-variant-numeric:tabular-nums}.description small{color:var(--muted-foreground);font-size:12px}.tag-list{font-size:11px!important}.amount{white-space:nowrap;font-size:13px}.positive{color:#2F7A2A}.negative{color:#C7473A}.empty{text-align:center;padding:35px 8px;color:var(--muted-foreground)}.empty>span{font-size:30px}.empty strong{display:block;color:var(--foreground);margin-top:10px}.empty p{margin:5px 0}.error{color:var(--destructive);font-size:13px}.notice{color:#2F7A2A;font-size:13px}.actions{display:flex;align-items:center}.upload{font-size:11px;color:var(--primary);cursor:pointer}.upload input{display:block;max-width:190px;font-size:11px}.attachment-list{display:flex;gap:7px;flex-wrap:wrap;font-size:12px}.attachment-list a{color:var(--primary)}.attachment-list button{border:0;background:none;color:var(--destructive);cursor:pointer}:global(.deleted-toggle){margin-top:14px}.deleted-row{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)}.deleted-row span{flex:1}select{min-height:40px;border:1px solid var(--input);border-radius:var(--radius);background:var(--background);color:var(--foreground);padding:8px 10px}select[multiple]{min-height:70px}
  @media(max-width:1000px){.layout{grid-template-columns:1fr}:global(.entry){order:1}:global(.history){order:2}}@media(max-width:600px){h1{font-size:29px}.filter-row{grid-template-columns:1fr}.row{grid-template-columns:34px minmax(0,1fr) auto 28px;gap:6px}.description small{font-size:11px}.amount{font-size:12px}}
</style>
