<script lang="ts">
  import BulkActions from '$lib/components/tracking/bulk-actions.svelte';
  import {Checkbox} from '$lib/components/ui/checkbox';
  import { formatDate } from '$lib/dates';
  import AmountInput from '$lib/components/forms/amount-input.svelte';
  import LoadingScope from '$lib/components/shared/loading-scope.svelte';
  import ChoiceSelect from '$lib/components/forms/choice-select.svelte';
  import DatePicker from '$lib/components/forms/date-picker.svelte';
  import {getContext as privacyContext} from 'svelte';
  import {concealed,PRIVACY_CONTEXT,type PrivacyState} from '$lib/privacy';
  const privacy=privacyContext<PrivacyState>(PRIVACY_CONTEXT);
  import { parseLocalizedAmount, formatExactAmount } from '$lib/ux/amount';
  import { getContext } from 'svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import * as Card from '$lib/components/ui/card';
  import * as Field from '$lib/components/ui/field';
  import * as Sheet from '$lib/components/ui/sheet';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import * as AlertDialog from '$lib/components/ui/alert-dialog';
  import * as ToggleGroup from '$lib/components/ui/toggle-group';
  import PageHeader from '$lib/components/shared/page-header.svelte';
  import MoneyDisplay from '$lib/components/shared/money-display.svelte';
  import EmptyState from '$lib/components/shared/empty-state.svelte';
  import LoadingSkeleton from '$lib/components/shared/loading-skeleton.svelte';
  import ResponsiveList from '$lib/components/shared/responsive-list.svelte';
  import { AUTH_UI_CONTEXT, type AuthUiState } from '$lib/i18n/auth';
  import { trackingText } from '$lib/i18n/tracking';
  import { uxText } from '$lib/i18n/ux';
  import MoreIcon from '@lucide/svelte/icons/ellipsis';
  import FilterIcon from '@lucide/svelte/icons/sliders-horizontal';
  import PlusIcon from '@lucide/svelte/icons/plus';

  type State={selectedId:string;ready:boolean};
  type Account={id:string;name:string;kind:string;currency:string};
  type Category={id:string;name:string;type:string};
  type Tag={id:string;name:string};
  type Attachment={id:string;name:string;mimeType:string};
  type Tx={id:string;accountId:string;destinationAccountId?:string;categoryId?:string;type:string;accountName:string;destinationAccountName?:string;categoryName?:string;amount:string;currency:string;date:string;notes?:string;merchant?:string;version:number;splits?:{categoryId:string;amount:string;notes?:string}[];destinationAmount?:string;baseAmount?:string;baseCurrency?:string;fx?:{rate:string;provider:string;date:string};tags:Tag[];attachments?:Attachment[]};
  const workspace=getContext<State>('capybudget-workspaces');
  const authUi=getContext<AuthUiState>(AUTH_UI_CONTEXT);const t=(key:Parameters<typeof trackingText>[1])=>trackingText(authUi.locale,key);
  const ux=(key:Parameters<typeof uxText>[1])=>uxText(authUi.locale,key);
  let accounts=$state<Account[]>([]),categories=$state<Category[]>([]),tags=$state<Tag[]>([]),items=$state<Tx[]>([]),deleted=$state<Tx[]>([]),editing=$state<Tx|null>(null),showDeleted=$state(false);
  let txType=$state('expense'),accountId=$state(''),destinationAccountId=$state(''),categoryId=$state(''),amount=$state(''),date=$state(today()),notes=$state(''),merchant=$state(''),tagIds=$state<string[]>([]);
  let query=$state(''),appliedQuery=$state(''),typeFilter=$state(''),from=$state(''),to=$state(''),sort=$state('date'),accountFilter=$state(''),categoryFilter=$state(''),tagFilter=$state(''),minAmount=$state(''),maxAmount=$state(''),cursor=$state(''),nextCursor=$state(''),busy=$state(false),loading=$state(true),loadingMore=$state(false),error=$state(''),notice=$state('');
  let refresh=$state(0),timer:ReturnType<typeof setTimeout>,previousWorkspace='',requestSequence=0;
  let categorySuggestion=$state<{categoryId:string;categoryName:string;source:string;reason:string}|null>(null),suggestionSequence=0;
  let formOpen=$state(false),filtersOpen=$state(false),deleteTarget=$state<Tx|null>(null),savedFlash=$state(false);
  let selected=$state<string[]>([]),splitEnabled=$state(false),splits=$state<{categoryId:string;amount:string;notes?:string}[]>([]),destinationAmount=$state(''),feeAmount=$state(''),feeCategoryId=$state('');
  const splitRemaining=$derived.by(()=>{
    const units=(value:string)=>{if(!/^\d{1,15}(\.\d{0,4})?$/.test(value))return 0n;const [whole,fraction='']=value.split('.');return BigInt(whole)*10000n+BigInt(fraction.padEnd(4,'0'));};
    const remaining=units(amount)-splits.reduce((sum,part)=>sum+units(part.amount),0n);
    const absolute=remaining<0n?-remaining:remaining;
    return (remaining<0n?'-':'')+(absolute/10000n).toString()+'.'+(absolute%10000n).toString().padStart(4,'0');
  });
  let pendingPayload = '', pendingKey = '';
  let fType=$state(''),fFrom=$state(''),fTo=$state(''),fSort=$state('date'),fAccount=$state(''),fCategory=$state(''),fTag=$state(''),fMin=$state(''),fMax=$state('');
  $effect(()=>{void (workspace as {revision?:number}).revision;const id=workspace.selectedId,type=txType,merchantValue=merchant;if(!id||!merchantValue.trim()||!['income','expense'].includes(type)){categorySuggestion=null;return;}const sequence=++suggestionSequence;const delay=setTimeout(async()=>{try{const response=await fetch(`/api/workspaces/${id}/assistant/categorize`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type,merchant:merchantValue,selectedCategoryId:categoryId||null})});const body=await response.json();if(sequence===suggestionSequence)categorySuggestion=body.suggestion??null;}catch{if(sequence===suggestionSequence)categorySuggestion=null;}},250);return()=>clearTimeout(delay);});
  function today(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta'}).format(new Date());}
  $effect(()=>{void (workspace as {revision?:number}).revision;const id=workspace.selectedId;const key=refresh;if(id&&previousWorkspace&&id!==previousWorkspace){accountId='';destinationAccountId='';categoryId='';tagIds=[];accountFilter='';categoryFilter='';tagFilter='';cursor='';items=[];editing=null;formOpen=false;splitEnabled=false;splits=[];feeAmount='';}if(id)previousWorkspace=id;const filters={search:appliedQuery,kind:typeFilter,start:from,end:to,order:sort,account:accountFilter,category:categoryFilter,tag:tagFilter,min:minAmount,max:maxAmount,after:cursor};if(id)void load(id,filters);});
  type Filters={search:string;kind:string;start:string;end:string;order:string;account:string;category:string;tag:string;min:string;max:string;after:string};
  async function load(id:string,filters:Filters){
    const sequence=++requestSequence;loading=true;error='';
    try{
      const [a,c,tg,d]=await Promise.all([fetch('/api/workspaces/'+id+'/accounts').then(r=>r.json()),fetch('/api/workspaces/'+id+'/categories').then(r=>r.json()),fetch('/api/workspaces/'+id+'/tags').then(r=>r.json()),fetch('/api/workspaces/'+id+'/transactions/deleted').then(r=>r.json())]);
      if(sequence!==requestSequence || id!==workspace.selectedId)return;
      accounts=a.items??[];categories=c.items??[];tags=tg.items??[];deleted=d.items??[];
      if(!accountId&&accounts.length)accountId=accounts[0].id;
      const params=new URLSearchParams();if(filters.search)params.set('q',filters.search);if(filters.kind)params.set('type',filters.kind);if(filters.start)params.set('from',filters.start);if(filters.end)params.set('to',filters.end);if(filters.account)params.set('accountIds',filters.account);if(filters.category)params.set('categoryIds',filters.category);if(filters.tag)params.set('tagIds',filters.tag);if(filters.min)params.set('minAmount',filters.min);if(filters.max)params.set('maxAmount',filters.max);params.set('sort',filters.order);if(filters.after)params.set('cursor',filters.after);
      const r=await fetch('/api/workspaces/'+id+'/transactions?'+params);const j=await r.json();if(sequence!==requestSequence)return;if(!r.ok)throw new Error(j.message??t('unableLoad'));items=filters.after?[...items,...j.items]:j.items;nextCursor=j.nextCursor??'';
    }catch(e){if(sequence===requestSequence)error=e instanceof Error?e.message:t('unableLoad');}
    finally{if(sequence===requestSequence){loading=false;loadingMore=false;}}
  }
  function applyFilters(){cursor='';refresh++;}
  function searchChanged(value:string){query=value;clearTimeout(timer);timer=setTimeout(()=>{cursor='';appliedQuery=value;refresh++;},250);}
  function openFilters(){fType=typeFilter;fFrom=from;fTo=to;fSort=sort;fAccount=accountFilter;fCategory=categoryFilter;fTag=tagFilter;fMin=minAmount;fMax=maxAmount;filtersOpen=true;}
  function applyDraftFilters(){typeFilter=fType;from=fFrom;to=fTo;sort=fSort;accountFilter=fAccount;categoryFilter=fCategory;tagFilter=fTag;minAmount=fMin;maxAmount=fMax;filtersOpen=false;applyFilters();}
  function clearFilters(){typeFilter=from=to='';sort='date';accountFilter=categoryFilter=tagFilter=minAmount=maxAmount=appliedQuery=query='';applyFilters();}
  function loadMore(){if(!nextCursor||loadingMore)return;loadingMore=true;cursor=nextCursor;}
  type Chip={key:string;label:string;clear:()=>void};
  const chips=$derived.by(()=>{
    const list:Chip[]=[];
    if(appliedQuery)list.push({key:'q',label:`“${appliedQuery}”`,clear:()=>{appliedQuery=query='';applyFilters();}});
    if(typeFilter)list.push({key:'type',label:typeFilter==='income'?t('typeIncome'):typeFilter==='expense'?t('typeExpense'):t('typeTransfer'),clear:()=>{typeFilter='';applyFilters();}});
    if(accountFilter){const a=accounts.find(x=>x.id===accountFilter);list.push({key:'account',label:a?.name??accountFilter,clear:()=>{accountFilter='';applyFilters();}});}
    if(categoryFilter){const c=categories.find(x=>x.id===categoryFilter);list.push({key:'category',label:c?.name??categoryFilter,clear:()=>{categoryFilter='';applyFilters();}});}
    if(tagFilter){const g=tags.find(x=>x.id===tagFilter);list.push({key:'tag',label:g?.name??tagFilter,clear:()=>{tagFilter='';applyFilters();}});}
    if(from||to)list.push({key:'dates',label:`${formatDate(from,'…')} → ${formatDate(to,'…')}`,clear:()=>{from=to='';applyFilters();}});
    if(minAmount||maxAmount)list.push({key:'amount',label:privacy.hidden?'••••••':`${minAmount||'0'} – ${maxAmount||'∞'}`,clear:()=>{minAmount=maxAmount='';applyFilters();}});
    if(sort!=='date')list.push({key:'sort',label:`${t('sortBy')}: ${sort==='amount'?t('sortAmount'):sort==='category'?t('sortCategory'):sort==='tag'?t('sortTag'):t('sortDate')}`,clear:()=>{sort='date';applyFilters();}});
    return list;
  });
  function openNew(){
    if(editing||savedFlash){amount='';notes='';merchant='';tagIds=[];date=today();categoryId='';destinationAccountId='';pendingPayload='';pendingKey='';}
    editing=null;savedFlash=false;error='';formOpen=true;splitEnabled=false;splits=[];destinationAmount='';feeAmount='';feeCategoryId='';
  }
  async function create(event:SubmitEvent){
    event.preventDefault();if(busy||!workspace.selectedId)return;busy=true;error='';notice='';
    const normalized=parseLocalizedAmount(amount,'en');
    if(!normalized){error=authUi.locale==='id'?'Masukkan jumlah yang valid.':'Enter a valid amount.';busy=false;return;}
    const payload:any={type:txType,accountId,amount:normalized,date,notes,merchant,tagIds};
    if(txType==='transfer'){payload.destinationAccountId=destinationAccountId;payload.destinationAmount=destinationAmount;payload.feeAmount=feeAmount||undefined;payload.feeCategoryId=feeCategoryId||undefined;}
    else if(splitEnabled)payload.splits=splits;else payload.categoryId=categoryId;
    try{
      const target=editing?'/api/workspaces/'+workspace.selectedId+'/transactions/'+editing.id+'?version='+editing.version:'/api/workspaces/'+workspace.selectedId+'/transactions';
      const fingerprint=JSON.stringify(payload);
      if (target+fingerprint!==pendingPayload) { pendingPayload=target+fingerprint;pendingKey=crypto.randomUUID(); }
      const response=await fetch(target,{method:editing?'PATCH':'POST',headers:{'content-type':'application/json',...(editing?{}:{'idempotency-key':pendingKey})},body:fingerprint});
      const result=await response.json();if(!response.ok)throw new Error(result.message??t('unableSave'));
      pendingPayload='';pendingKey='';
      amount='';notes='';merchant='';tagIds=[];date=today();splits=splits.map(part=>({...part,amount:''}));feeAmount='';destinationAmount='';
      if(editing){editing=null;notice=t('txSaved');formOpen=false;}
      else{savedFlash=true;notice=t('txSaved');}
      refresh++;
    }catch(e){error=e instanceof Error?e.message:t('unableSave');}
    finally{busy=false;}
  }
  async function confirmRemove(){
    const item=deleteTarget;if(!item)return;
    error='';notice='';
    try{const r=await fetch('/api/workspaces/'+workspace.selectedId+'/transactions/'+item.id+'?version='+item.version,{method:'DELETE'});if(!r.ok){const j=await r.json();throw new Error(j.message??t('unableDelete'));}notice=t('txDeleted');refresh++;}
    catch(e){error=e instanceof Error?e.message:t('unableDelete');}
    finally{deleteTarget=null;}
  }
  function edit(item:Tx){editing=item;splitEnabled=!!item.splits?.length;splits=item.splits?.map(x=>({...x}))??[];destinationAmount=item.destinationAmount??'';feeAmount='';feeCategoryId='';txType=item.type;accountId=item.accountId;destinationAccountId=item.destinationAccountId??'';categoryId=item.categoryId??'';amount=item.amount;date=item.date;notes=item.notes??'';merchant=item.merchant??'';tagIds=item.tags.map(x=>x.id);savedFlash=false;error='';formOpen=true;}
  async function restore(item:Tx){try{const r=await fetch(`/api/workspaces/${workspace.selectedId}/transactions/${item.id}/restore`,{method:'POST'});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.message??t('unableRestore'));notice=t('txRestored');refresh++;}catch(e){error=e instanceof Error?e.message:t('unableRestore');}}
  async function uploadAttachment(item:Tx,event:Event){const input=event.currentTarget as HTMLInputElement,file=input.files?.[0];if(!file)return;error='';try{const r=await fetch(`/api/workspaces/${workspace.selectedId}/transactions/${item.id}/attachments?name=${encodeURIComponent(file.name)}`,{method:'POST',headers:{'content-type':file.type},body:file});const j=await r.json();if(!r.ok)throw new Error(j.message??t('unableReceipt'));notice=t('receiptAttached');refresh++;}catch(e){error=e instanceof Error?e.message:t('unableReceipt');}finally{input.value='';}}
  async function removeAttachment(id:string){try{const r=await fetch(`/api/workspaces/${workspace.selectedId}/attachments/${id}`,{method:'DELETE'});if(!r.ok)throw new Error(t('removeReceipt'));refresh++;}catch(e){error=e instanceof Error?e.message:t('removeReceipt');}}
</script>
<LoadingScope active={!!busy || !!loading || !!loadingMore} />

<PageHeader eyebrow={authUi.locale==='id'?'PENCATATAN HARIAN':'EVERYDAY TRACKING'} title={t('transactionHeading')} description={t('transactionIntro')}>
  {#snippet actions()}<Button onclick={openNew}><PlusIcon data-icon="inline-start" />{t('newTransaction')}</Button>{/snippet}
</PageHeader>
{#if !workspace.ready}<LoadingSkeleton rows={4} label={t('loading')} />
{:else if !workspace.selectedId}<p role="alert">{t('chooseWorkspace')}</p>
{:else}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if notice}<p class="notice" role="status">{notice}</p>{/if}
  <div class="toolbar">
    <Input id="search" value={query} oninput={(e)=>searchChanged(e.currentTarget.value)} placeholder={t('search')} aria-label={t('search')} />
    <Button variant="outline" onclick={openFilters}><FilterIcon data-icon="inline-start" />{t('filters')}{chips.length?` (${chips.length})`:''}</Button>
  </div>
  {#if chips.length}
    <ul class="chips" aria-label={t('filters')}>
      {#each chips as chip (chip.key)}<li><Button variant="ghost" type="button" onclick={chip.clear} aria-label="{t('removeFilter')}: {chip.label}">{chip.label} ×</Button></li>{/each}
      <li><Button variant="ghost" type="button" class="clear" onclick={clearFilters}>{t('clearFilters')}</Button></li>
    </ul>
  {/if}
<BulkActions workspaceId={workspace.selectedId} {items} {categories} {tags} bind:selected onUpdated={()=>refresh++}/>
  <Card.Root class="history">
    <Card.Header><Card.Title>{t('history')}</Card.Title></Card.Header>
    <Card.Content>
      {#if loading}<LoadingSkeleton rows={5} label={t('loadingTx')} />
      {:else if items.length===0}<EmptyState title={t('noTx')} body={t('noTxHint')} actionLabel={t('newTransaction')} onAction={openNew} />
      {:else}
        <ResponsiveList label={t('history')}>
          {#each items as item (item.id)}
          <li>
            <article class="row">
              <span class="select-transaction"><Checkbox checked={selected.includes(item.id)} aria-label={`${authUi.locale==='id'?'Pilih':'Select'} ${item.merchant||item.notes||item.type}`} onCheckedChange={(v)=>{if(v&&selected.length<100)selected=[...selected,item.id];else selected=selected.filter(x=>x!==item.id);}}/></span>
              <span class="type-icon" class:income={item.type==='income'} class:expense={item.type==='expense'} aria-hidden="true">{item.type==='income'?'↗':item.type==='expense'?'↘':'↔'}</span>
              <div class="description">
                <strong>{item.merchant||item.notes||item.type}</strong>
                <small>{item.type==='transfer'?item.accountName+' → '+item.destinationAccountName:(item.splits?.length?(authUi.locale==='id'?'Beberapa kategori':'Split categories'):item.categoryName)+' · '+item.accountName} · {formatDate(item.date)}</small>
                {#if item.fx&&item.baseCurrency&&item.baseCurrency!==item.currency}<small>{authUi.locale==='id'?'Kurs':'Rate'}: {privacy.hidden?'••••••':item.fx.rate} {item.baseCurrency} / {item.currency} · {formatDate(item.fx.date)} · {item.fx.provider}</small>{/if}
                {#if item.tags?.length}<small class="tag-list">{item.tags.map(x=>x.name).join(' · ')}</small>{/if}
                {#if item.attachments?.length}
                  <small class="receipt-status">{t('receiptAttached')}</small>
                {:else}
                  <label class="upload">{t('attachReceipt')}<Input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onchange={(e)=>uploadAttachment(item,e)} /></label>
                {/if}
              </div>
              <MoneyDisplay amount={item.amount} currency={item.currency} type={item.type==='income'||item.type==='expense'?item.type:null} />
              <DropdownMenu.Root>
                <DropdownMenu.Trigger>
                  {#snippet child({ props })}<Button {...props} variant="ghost" size="icon" aria-label={`${t('transactionActions')}: ${item.merchant||item.notes||item.type}`}><MoreIcon /></Button>{/snippet}
                </DropdownMenu.Trigger>
                <DropdownMenu.Content>
                  <DropdownMenu.Group>
                    <DropdownMenu.Item onclick={()=>edit(item)}>{t('editAction')}</DropdownMenu.Item>
                    {#if item.attachments?.length}
                      <DropdownMenu.Separator />
                      {#each item.attachments as attachment, index (attachment.id)}
                        <DropdownMenu.Item>
                          {#snippet child({ props })}
                            <a {...props} href={`/api/workspaces/${workspace.selectedId}/attachments/${attachment.id}/download?inline=1`} target="_blank" rel="noopener noreferrer">
                              {t('viewReceipt')}{(item.attachments?.length ?? 0) > 1 ? ` ${index + 1}` : ''}
                            </a>
                          {/snippet}
                        </DropdownMenu.Item>
                        <DropdownMenu.Item onclick={()=>removeAttachment(attachment.id)}>
                          {t('removeReceiptAction')}{(item.attachments?.length ?? 0) > 1 ? ` ${index + 1}` : ''}
                        </DropdownMenu.Item>
                      {/each}
                      <DropdownMenu.Separator />
                    {/if}
                    <DropdownMenu.Item onclick={()=>deleteTarget=item}>{t('delete')}</DropdownMenu.Item>
                  </DropdownMenu.Group>
                </DropdownMenu.Content>
              </DropdownMenu.Root>
            </article>
          </li>
          {/each}
        </ResponsiveList>
        {#if nextCursor}<Button variant="outline" class="more" onclick={loadMore} disabled={loadingMore}>{loadingMore?t('loading'):t('loadMore')}</Button>{/if}
      {/if}
      <Button variant="outline" class="deleted-toggle" onclick={()=>showDeleted=!showDeleted}>{showDeleted?t('hideDeleted'):t('showDeleted')}</Button>
      {#if showDeleted}<div class="deleted-list">{#each deleted as item (item.id)}<article class="deleted-row"><span>{item.merchant||item.notes||item.type} · {formatDate(item.date)}</span><MoneyDisplay amount={item.amount} currency={item.currency} /><Button size="sm" variant="outline" onclick={()=>restore(item)}>{t('restore')}</Button></article>{/each}</div>{/if}
    </Card.Content>
  </Card.Root>

  <Sheet.Root bind:open={formOpen}>
    <Sheet.Content side="bottom" class="form-sheet">
      <Sheet.Header><Sheet.Title>{editing?t('editTransaction'):t('newTransaction')}</Sheet.Title></Sheet.Header>
      <form class="sheet-form" onsubmit={create}>
        <Field.FieldGroup>
          <Field.Field>
            <Field.FieldLabel>{t('typeLabel')}</Field.FieldLabel>
            <ToggleGroup.Root type="single" value={txType} onValueChange={(value)=>{if(value==='expense'||value==='income'||value==='transfer'){if(value!==txType){categoryId='';destinationAccountId='';}txType=value;}}} aria-label={t('typeLabel')}>
              <ToggleGroup.Item value="expense">{t('typeExpense')}</ToggleGroup.Item>
              <ToggleGroup.Item value="income">{t('typeIncome')}</ToggleGroup.Item>
              <ToggleGroup.Item value="transfer">{t('typeTransfer')}</ToggleGroup.Item>
            </ToggleGroup.Root>
          </Field.Field>
          <Field.Field><Field.FieldLabel for="amount">{t('amount')}</Field.FieldLabel><AmountInput currency={accounts.find(account => account.id === accountId)?.currency} id="amount" type={privacy.hidden?'password':'text'} bind:value={amount} inputmode="decimal" placeholder={authUi.locale==='id'?'0,00':'0.00'} required /></Field.Field>
          <Field.Field><Field.FieldLabel for="account">{t('account')}</Field.FieldLabel><ChoiceSelect id="account" bind:value={accountId} required items={[{value: '', label: String(t('chooseAccount'))}, ...(accounts).flatMap((account) => [{value: account.id, label: String(account.name)}])]} /></Field.Field>
          {#if txType==='transfer'}
            <Field.Field><Field.FieldLabel for="destination">{t('toAccount')}</Field.FieldLabel><ChoiceSelect id="destination" bind:value={destinationAccountId} required items={[{value: '', label: String(t('chooseDestination'))}, ...(accounts.filter(a=>a.id!==accountId)).flatMap((account) => [{value: account.id, label: String(account.name)}])]} /></Field.Field>
          {:else}
            <Button type="button" variant="outline" aria-pressed={splitEnabled} onclick={()=>{splitEnabled=!splitEnabled;if(splitEnabled&&!splits.length)splits=[{categoryId:'',amount:''},{categoryId:'',amount:''}];}}>{authUi.locale==='id'?'Bagi ke beberapa kategori':'Split across categories'}</Button>
            {#if splitEnabled}
            <fieldset class="split-editor"><legend>{authUi.locale==='id'?'Alokasi (total harus sama dengan jumlah transaksi)':'Allocations (must add up to the transaction total)'}</legend>
              <p aria-live="polite">{authUi.locale==='id'?'Sisa untuk dialokasikan':'Remaining to allocate'}: {privacy.hidden?'••••••':formatExactAmount(splitRemaining,authUi.locale)}</p>
              {#each splits as part,i}<div class="split-row"><label for={`split-category-${i}`}>{t('category')} {i+1}</label><ChoiceSelect id={`split-category-${i}`} bind:value={part.categoryId} required items={[{value:'',label:t('chooseCategory')},...categories.filter(x=>x.type===txType).map(x=>({value:x.id,label:x.name}))]}/><label for={`split-amount-${i}`}>{t('amount')} {i+1}</label><AmountInput id={`split-amount-${i}`} bind:value={part.amount} currency={accounts.find(x=>x.id===accountId)?.currency} required/><Button variant="ghost" type="button" disabled={splits.length<=2} onclick={()=>splits=splits.filter((_,n)=>n!==i)}>{t('delete')}</Button></div>{/each}
              <Button variant="outline" type="button" disabled={splits.length>=30} onclick={()=>splits=[...splits,{categoryId:'',amount:''}]}>{authUi.locale==='id'?'Tambah alokasi':'Add allocation'}</Button>
            </fieldset>
            {:else}
            <Field.Field><Field.FieldLabel for="category">{t('category')}</Field.FieldLabel><ChoiceSelect id="category" bind:value={categoryId} required items={[{value: '', label: String(t('chooseCategory'))}, ...(categories.filter(c=>c.type===txType)).flatMap((category) => [{value: category.id, label: String(category.name)}])]} />{#if categorySuggestion&&categorySuggestion.categoryId!==categoryId}<Field.FieldDescription>{t('categorySuggestion').replace('{category}',categorySuggestion.categoryName)} {t(categorySuggestion.source==='explicit_rule'?'categorySuggestionExplicit':'categorySuggestionLearned')} <Button type="button" variant="link" size="sm" onclick={()=>categoryId=categorySuggestion!.categoryId}>{t('useSuggestion')}</Button></Field.FieldDescription>{/if}</Field.Field>
            {/if}
          {/if}
          {#if txType==='transfer'&&destinationAccountId&&accounts.find(x=>x.id===accountId)?.currency!==accounts.find(x=>x.id===destinationAccountId)?.currency}
          <Field.Field><Field.FieldLabel for="destination-amount">{authUi.locale==='id'?'Jumlah diterima':'Amount received'}</Field.FieldLabel><AmountInput id="destination-amount" bind:value={destinationAmount} currency={accounts.find(x=>x.id===destinationAccountId)?.currency} required/></Field.Field>
          {/if}
          {#if txType==='transfer'&&!editing}<Field.Field><Field.FieldLabel for="transfer-fee">{authUi.locale==='id'?'Biaya transfer (dicatat sebagai pengeluaran terpisah)':'Transfer fee (recorded as a separate expense)'}</Field.FieldLabel><AmountInput id="transfer-fee" bind:value={feeAmount} currency={accounts.find(x=>x.id===accountId)?.currency}/></Field.Field>{#if feeAmount}<Field.Field><Field.FieldLabel for="fee-category">{t('category')}</Field.FieldLabel><ChoiceSelect id="fee-category" bind:value={feeCategoryId} required items={[{value:'',label:t('chooseCategory')},...categories.filter(x=>x.type==='expense').map(x=>({value:x.id,label:x.name}))]}/></Field.Field>{/if}{/if}
          <Field.Field><Field.FieldLabel for="tx-date">{t('date')}</Field.FieldLabel><DatePicker id="tx-date" bind:value={date} required /></Field.Field>
          <Field.Field><Field.FieldLabel for="merchant">{t('merchant')}</Field.FieldLabel><Input id="merchant" bind:value={merchant} maxlength={200} /></Field.Field>
          <Field.Field><Field.FieldLabel for="notes">{t('note')}</Field.FieldLabel><Input id="notes" bind:value={notes} maxlength={2000} placeholder={t('whatFor')} /></Field.Field>
          {#if tags.length}<Field.Field><Field.FieldLabel for="tags">{t('tagsOptional')}</Field.FieldLabel><ChoiceSelect id="tags" multiple bind:value={tagIds} items={[...(tags).flatMap((tag) => [{value: tag.id, label: String(tag.name)}])]} /><Field.FieldDescription>{t('tagsHint')}</Field.FieldDescription></Field.Field>{/if}
          {#if error}<p class="error" role="alert">{error}</p>{/if}
          {#if savedFlash}<p class="notice" role="status">{t('txSaved')}</p>{/if}
          {#if editing}<p class="notice">{t('editingTx')}</p>{/if}
          <Button type="submit" disabled={busy||accounts.length===0}>{busy?t('saving'):editing?t('saveChanges'):t('saveTransaction')}</Button>
        </Field.FieldGroup>
      </form>
    </Sheet.Content>
  </Sheet.Root>

  <Sheet.Root bind:open={filtersOpen}>
    <Sheet.Content side="bottom" class="form-sheet">
      <Sheet.Header><Sheet.Title>{t('filters')}</Sheet.Title></Sheet.Header>
      <div class="sheet-form"><Field.FieldGroup>
        <Field.Field><Field.FieldLabel for="filter-type">{t('typeLabel')}</Field.FieldLabel><ChoiceSelect id="filter-type" bind:value={fType} items={[{value: '', label: String(t('all'))}, {value: "income", label: String(t('typeIncome'))}, {value: "expense", label: String(t('typeExpense'))}, {value: "transfer", label: String(t('typeTransfer'))}]} /></Field.Field>
        <div class="filter-row">
          <Field.Field><Field.FieldLabel for="from">{t('from')}</Field.FieldLabel><DatePicker id="from" bind:value={fFrom} /></Field.Field>
          <Field.Field><Field.FieldLabel for="to">{t('to')}</Field.FieldLabel><DatePicker id="to" bind:value={fTo} /></Field.Field>
        </div>
        <Field.Field><Field.FieldLabel for="account-filter">{t('account')}</Field.FieldLabel><ChoiceSelect id="account-filter" bind:value={fAccount} items={[{value: '', label: String(t('allAccounts'))}, ...(accounts).flatMap((account) => [{value: account.id, label: String(account.name)}])]} /></Field.Field>
        <Field.Field><Field.FieldLabel for="category-filter">{t('category')}</Field.FieldLabel><ChoiceSelect id="category-filter" bind:value={fCategory} items={[{value: '', label: String(t('allCategories'))}, ...(categories).flatMap((category) => [{value: category.id, label: String(category.name)}])]} /></Field.Field>
        <Field.Field><Field.FieldLabel for="tag-filter">{t('tagLabel')}</Field.FieldLabel><ChoiceSelect id="tag-filter" bind:value={fTag} items={[{value: '', label: String(t('allTags'))}, ...(tags).flatMap((tag) => [{value: tag.id, label: String(tag.name)}])]} /></Field.Field>
        <div class="filter-row">
          <Field.Field><Field.FieldLabel for="minimum">{t('minAmount')}</Field.FieldLabel><AmountInput currency={accounts.find(account => account.id === fAccount)?.currency} id="minimum" type={privacy.hidden?'password':'text'} bind:value={fMin} inputmode="decimal" /></Field.Field>
          <Field.Field><Field.FieldLabel for="maximum">{t('maxAmount')}</Field.FieldLabel><AmountInput currency={accounts.find(account => account.id === fAccount)?.currency} id="maximum" type={privacy.hidden?'password':'text'} bind:value={fMax} inputmode="decimal" /></Field.Field>
        </div>
        <Field.Field><Field.FieldLabel for="sort">{t('sortBy')}</Field.FieldLabel><ChoiceSelect id="sort" bind:value={fSort} items={[{value: "date", label: String(t('sortDate'))}, {value: "amount", label: String(t('sortAmount'))}, {value: "category", label: String(t('sortCategory'))}, {value: "tag", label: String(t('sortTag'))}]} /></Field.Field>
        <div class="filter-actions"><Button variant="outline" onclick={()=>{filtersOpen=false;clearFilters();}}>{t('clearFilters')}</Button><Button onclick={applyDraftFilters}>{t('applyFilters')}</Button></div>
      </Field.FieldGroup></div>
    </Sheet.Content>
  </Sheet.Root>

  <AlertDialog.Root open={!!deleteTarget} onOpenChange={(v)=>{if(!v)deleteTarget=null;}}>
    <AlertDialog.Content>
      <AlertDialog.Header><AlertDialog.Title>{t('deleteTitle')}</AlertDialog.Title><AlertDialog.Description>{t('deleteBody')}</AlertDialog.Description></AlertDialog.Header>
      <AlertDialog.Footer><AlertDialog.Cancel onclick={()=>deleteTarget=null}>{t('cancel')}</AlertDialog.Cancel><AlertDialog.Action onclick={confirmRemove}>{t('delete')}</AlertDialog.Action></AlertDialog.Footer>
    </AlertDialog.Content>
  </AlertDialog.Root>
{/if}

<style>
  .select-transaction{display:grid;place-items:center;width:44px;height:44px}
 .select-transaction :global([data-slot="checkbox"]){width:20px;height:20px;border-radius:8px}
 .select-transaction :global([data-slot="checkbox"])::after{inset:-12px}
 .split-editor{border:2px solid var(--border);border-radius:var(--radius-card);padding:16px;display:grid;gap:16px}.split-row{display:grid;gap:8px}
  .toolbar{display:flex;gap:8px;margin-bottom:12px}
  .toolbar :global(input){flex:1;min-width:0}
  .chips{list-style:none;display:flex;flex-wrap:wrap;gap:8px;margin:0 0 12px;padding:0}
  .chips :global([data-slot="button"]){min-height:44px;border:1px solid var(--input);border-radius:99px;background:var(--secondary);color:var(--secondary-foreground);padding:4px 12px;font:inherit;font-size:13px;cursor:pointer}
  .chips :global([data-slot="button"].clear){background:none;border-color:transparent;color:var(--brand-ink)}
  .row{display:grid;grid-template-columns:44px 38px minmax(0,1fr) auto auto;align-items:center;gap:8px}
  .type-icon{display:grid;place-items:center;width:36px;height:36px;border-radius:var(--radius-input);background:var(--secondary);color:var(--secondary-foreground);font-size:18px}
  .type-icon.income{color:var(--income-ink);background:var(--leaf-soft)}
  .type-icon.expense{color:var(--expense-ink);background:var(--coral-soft)}
  .description{min-width:0;display:grid;gap:3px}
  .description strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .description small{color:var(--muted-foreground);font-size:12px}
  .tag-list{font-size:11px!important}
  .upload{font-size:11px;color:var(--brand-ink);cursor:pointer}
  .upload :global([data-slot="input"]){display:block;max-width:190px;font-size:11px}
  .receipt-status{color:var(--text-blue)}
  :global(.more){margin-top:12px}
  :global(.deleted-toggle){margin-top:12px}
  .deleted-row{display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border)}
  .deleted-row span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .error{color:var(--destructive);font-size:13px}
  .notice{color:var(--income-ink);font-size:13px}

  :global(.form-sheet){max-height:92dvh;max-width:560px;margin-inline:auto;border-radius:20px 20px 0 0;overflow:hidden;gap:0}
    :global(.form-sheet [data-slot="sheet-header"]){padding:16px 64px 16px 16px;flex-shrink:0}
  .sheet-form{min-height:0;overflow-y:auto;overscroll-behavior:contain;scrollbar-gutter:stable;padding:8px 16px calc(24px + env(safe-area-inset-bottom))}
  @media(min-width:640px){
    :global(.form-sheet){max-height:min(92dvh,calc(100dvh - 48px))}
    :global(.form-sheet [data-slot="sheet-header"]){padding:24px 64px 16px 24px}
    .sheet-form{padding-inline:24px}
  }
  .filter-row{display:grid;grid-template-columns:1fr 1fr;gap:8px}
  .filter-actions{display:flex;justify-content:flex-end;gap:8px}
  @media (min-width:640px){:global(.form-sheet){bottom:24px;border:1px solid var(--border);border-radius:var(--radius-card)}}
  @media(max-width:600px){.row{grid-template-columns:44px 28px minmax(0,1fr) auto 44px;gap:4px}.description small{font-size:11px}}
</style>
