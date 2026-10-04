<script lang="ts">
  import { formatDate } from '$lib/dates';
  import AmountInput from '$lib/components/forms/amount-input.svelte';
  import LoadingScope from '$lib/components/shared/loading-scope.svelte';
  import ChoiceSelect from '$lib/components/forms/choice-select.svelte';
  import DatePicker from '$lib/components/forms/date-picker.svelte';
  import { getContext } from 'svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import * as Card from '$lib/components/ui/card';
  import * as Field from '$lib/components/ui/field';
  import * as AlertDialog from '$lib/components/ui/alert-dialog';
  import PageHeader from '$lib/components/shared/page-header.svelte';
  import MoneyDisplay from '$lib/components/shared/money-display.svelte';
  import EmptyState from '$lib/components/shared/empty-state.svelte';
  import ErrorState from '$lib/components/shared/error-state.svelte';
  import LoadingSkeleton from '$lib/components/shared/loading-skeleton.svelte';
  import ResponsiveList from '$lib/components/shared/responsive-list.svelte';
  import StatusBadge from '$lib/components/shared/status-badge.svelte';
  import { AUTH_UI_CONTEXT, type AuthUiState } from '$lib/i18n/auth';
  import { trackingText } from '$lib/i18n/tracking';
  import { uxText } from '$lib/i18n/ux';

  type State={selectedId:string;ready:boolean;items:{id:string;currency:string}[]};
  type Account={id:string;name:string;currency?:string};type Category={id:string;name:string;type:string};
  type Rule={id:string;name:string;type:string;accountId:string;destinationAccountId?:string;categoryId?:string;amount:string;frequency:string;interval:number;anchorDate:string;endDate?:string|null;nextDueDate:string;mode:string;status:string;version:number};
  type Occurrence={id:string;ruleName:string;date:string;status:string;amount:string;currency:string};
  const workspace=getContext<State>('capybudget-workspaces');
  const authUi=getContext<AuthUiState>(AUTH_UI_CONTEXT);const t=(key:Parameters<typeof trackingText>[1])=>trackingText(authUi.locale,key);
  const ux=(key:Parameters<typeof uxText>[1])=>uxText(authUi.locale,key);
  let accounts=$state<Account[]>([]),categories=$state<Category[]>([]),rules=$state<Rule[]>([]),occurrences=$state<Occurrence[]>([]);
  let name=$state(''),type=$state('expense'),accountId=$state(''),destinationId=$state(''),categoryId=$state(''),amount=$state(''),frequency=$state('month'),interval=$state(1),mode=$state('manual'),anchorDate=$state(today()),endDate=$state(''),busy=$state(false),loading=$state(true),error=$state(''),notice=$state(''),reload=$state(0),editingRule=$state<Rule|null>(null),requestSequence=0,archiveTarget=$state<Rule|null>(null);
  const unitFor=(f:string)=>f==='day'?t('dayUnit'):f==='week'?t('weekUnit'):f==='year'?t('yearUnit'):t('monthUnit');
  const ruleSummary=(rule:Rule)=>`${rule.status} · ${t('everyN')} ${rule.interval} ${unitFor(rule.frequency)}${rule.interval>1&&authUi.locale==='en'?'s':''} · ${t('nextOn')} ${formatDate(rule.nextDueDate)}`;
  function today(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta'}).format(new Date());}
  $effect(()=>{void (workspace as {revision?:number}).revision;const id=workspace.selectedId,key=reload;if(id)void load(id);});
  async function load(id:string){const sequence=++requestSequence;loading=true;error='';try{
    await fetch(`/api/workspaces/${id}/recurring-occurrences/materialize`,{method:'POST'});
    const [a,c,r,o]=await Promise.all([fetch(`/api/workspaces/${id}/accounts`).then(x=>x.json()),fetch(`/api/workspaces/${id}/categories`).then(x=>x.json()),fetch(`/api/workspaces/${id}/recurring-rules`).then(x=>x.json()),fetch(`/api/workspaces/${id}/recurring-occurrences`).then(x=>x.json())]);
    if(sequence!==requestSequence)return;accounts=a.items;categories=c.items;rules=r.items;occurrences=o.items;if(!accountId&&accounts.length)accountId=accounts[0].id;
  }catch(e){if(sequence===requestSequence)error=e instanceof Error?e.message:t('unableRecurring');}finally{if(sequence===requestSequence)loading=false;}}
  async function create(e:SubmitEvent){e.preventDefault();if(busy||!workspace.selectedId)return;busy=true;error='';notice='';
    try{const payload:any={name,type,accountId,amount,frequency,interval,mode,anchorDate,endDate:endDate||null};if(type==='transfer')payload.destinationAccountId=destinationId;else payload.categoryId=categoryId;
      const url=editingRule?`/api/workspaces/${workspace.selectedId}/recurring-rules/${editingRule.id}`:`/api/workspaces/${workspace.selectedId}/recurring-rules`;
      const r=await fetch(url,{method:editingRule?'PATCH':'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...payload,...(editingRule?{version:editingRule.version}:{})})});const j=await r.json();if(!r.ok)throw new Error(j.message??t('unableSaveRule'));name='';amount='';endDate='';editingRule=null;notice=t('ruleSaved');reload++;
    }catch(e){error=e instanceof Error?e.message:t('unableCreateRule');}finally{busy=false;}}
  async function action(item:Occurrence,verb:'confirm'|'skip'){error='';try{const r=await fetch(`/api/workspaces/${workspace.selectedId}/recurring-occurrences/${item.id}/${verb}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({})});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.message??t('unableOcc'));notice=verb==='confirm'?t('occRecorded'):t('occSkipped');reload++;}catch(e){error=e instanceof Error?e.message:t('unableOcc');}}
  async function ruleAction(rule:Rule,status:'paused'|'active'){try{const r=await fetch(`/api/workspaces/${workspace.selectedId}/recurring-rules/${rule.id}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({status,version:rule.version})});const j=await r.json();if(!r.ok)throw new Error(j.message??t('unableRule'));notice=t('ruleUpdated');reload++;}catch(e){error=e instanceof Error?e.message:t('unableRule');}}
  async function confirmArchive(){
    const rule=archiveTarget;if(!rule)return;
    try{const r=await fetch(`/api/workspaces/${workspace.selectedId}/recurring-rules/${rule.id}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({status:'archived',version:rule.version})});const j=await r.json();if(!r.ok)throw new Error(j.message??t('unableRule'));notice=t('ruleUpdated');reload++;}
    catch(e){error=e instanceof Error?e.message:t('unableRule');}
    finally{archiveTarget=null;}
  }
  function editRule(rule:Rule){editingRule=rule;name=rule.name;type=rule.type;accountId=rule.accountId;destinationId=rule.destinationAccountId??'';categoryId=rule.categoryId??'';amount=rule.amount;frequency=rule.frequency;interval=rule.interval;mode=rule.mode;anchorDate=rule.anchorDate;endDate=rule.endDate??'';}
</script>
<LoadingScope active={!!busy || !!loading} />

<PageHeader eyebrow={authUi.locale==='id'?'OTOMATISKAN RUTINITAS':'AUTOMATE ROUTINE TRACKING'} title={t('recurringHeading')} description={t('recurringIntro')} />
{#if !workspace.ready}<LoadingSkeleton rows={3} label={t('loading')} />{:else if !workspace.selectedId}<p role="alert">{t('chooseWorkspace')}</p>{:else}
  {#if error}<ErrorState title={ux('errorTitle')} message={error} retryLabel={ux('retry')} onRetry={()=>reload++} />{/if}
  {#if notice}<p class="notice" role="status">{notice}</p>{/if}
  <div class="grid">
    <Card.Root><Card.Header><Card.Title>{t('upcoming')}</Card.Title><Card.Description>{t('manualHint')}</Card.Description></Card.Header><Card.Content>
      {#if loading}<LoadingSkeleton rows={3} label={t('loading')} />
      {:else if occurrences.length===0}<EmptyState title={t('upcoming')} body={t('nothingScheduled')} actionLabel={t('ruleName')} actionHref="#rule-name" />
      {:else}
      <ResponsiveList label={t('upcoming')}>
        {#each occurrences as item (item.id)}
        <li><article class="item">
          <div><strong>{item.ruleName}</strong><small>{formatDate(item.date)}</small></div>
          <StatusBadge tone={item.status==='pending'?'warning':'neutral'}>{item.status}</StatusBadge>
          <MoneyDisplay amount={item.amount} currency={item.currency} />
          {#if item.status==='pending'}<div class="actions"><Button size="sm" onclick={()=>action(item,'confirm')}>{t('confirm')}</Button><Button size="sm" variant="outline" onclick={()=>action(item,'skip')}>{t('skip')}</Button></div>{/if}
        </article></li>
        {/each}
      </ResponsiveList>
      {/if}
    </Card.Content></Card.Root>
    <Card.Root><Card.Header><Card.Title>{editingRule?t('editRuleTitle'):t('addRule')}</Card.Title><Card.Description>{t('autoHint')}</Card.Description></Card.Header><Card.Content><form onsubmit={create}><Field.FieldGroup>
      <Field.Field><Field.FieldLabel for="rule-name">{t('ruleName')}</Field.FieldLabel><Input id="rule-name" bind:value={name} required maxlength={100} placeholder={t('salaryPlaceholder')} /></Field.Field>
      <Field.Field><Field.FieldLabel for="rule-type">{t('typeLabel')}</Field.FieldLabel><ChoiceSelect id="rule-type" bind:value={type} items={[{value: "expense", label: String(t('typeExpense'))}, {value: "income", label: String(t('typeIncome'))}, {value: "transfer", label: String(t('typeTransfer'))}]} /></Field.Field>
      <Field.Field><Field.FieldLabel for="rule-amount">{t('amount')}</Field.FieldLabel><AmountInput currency={accounts.find(account => account.id === accountId)?.currency} id="rule-amount" bind:value={amount} inputmode="decimal" required /></Field.Field>
      <Field.Field><Field.FieldLabel for="rule-account">{t('account')}</Field.FieldLabel><ChoiceSelect id="rule-account" bind:value={accountId} required items={[...(accounts).flatMap((a) => [{value: a.id, label: String(a.name)}])]} /></Field.Field>
      {#if type==='transfer'}<Field.Field><Field.FieldLabel for="rule-destination">{t('toAccount')}</Field.FieldLabel><ChoiceSelect id="rule-destination" bind:value={destinationId} required items={[...(accounts.filter(a=>a.id!==accountId)).flatMap((a) => [{value: a.id, label: String(a.name)}])]} /></Field.Field>
      {:else}<Field.Field><Field.FieldLabel for="rule-category">{t('category')}</Field.FieldLabel><ChoiceSelect id="rule-category" bind:value={categoryId} required items={[...(categories.filter(c=>c.type===type)).flatMap((c) => [{value: c.id, label: String(c.name)}])]} /></Field.Field>{/if}
      <div class="two"><Field.Field><Field.FieldLabel for="frequency">{t('repeat')}</Field.FieldLabel><ChoiceSelect id="frequency" bind:value={frequency} items={[{value: "day", label: String(t('daily'))}, {value: "week", label: String(t('weekly'))}, {value: "month", label: String(t('monthly'))}, {value: "year", label: String(t('yearly'))}]} /></Field.Field><Field.Field><Field.FieldLabel for="interval">{t('every')}</Field.FieldLabel><Input id="interval" type="number" min="1" max="365" bind:value={interval} required /></Field.Field></div>
      <Field.Field><Field.FieldLabel for="anchor-date">{t('firstDate')}</Field.FieldLabel><DatePicker id="anchor-date" bind:value={anchorDate} required /></Field.Field>
      <Field.Field><Field.FieldLabel for="end-date">{t('endDateOpt')}</Field.FieldLabel><DatePicker id="end-date" bind:value={endDate} /></Field.Field>
      <Field.Field><Field.FieldLabel for="mode">{t('posting')}</Field.FieldLabel><ChoiceSelect id="mode" bind:value={mode} items={[{value: "manual", label: String(t('askConfirm'))}, {value: "auto", label: String(t('autoRecord'))}]} /></Field.Field>
      {#if editingRule}<Button type="button" variant="outline" onclick={()=>editingRule=null}>{t('cancel')}</Button>{/if}<Button type="submit" disabled={busy}>{busy?t('saving'):t('saveRule')}</Button>
    </Field.FieldGroup></form></Card.Content></Card.Root>
  </div>
  <Card.Root class="rules"><Card.Header><Card.Title>{t('rules')}</Card.Title></Card.Header><Card.Content>
    {#if rules.length===0}<EmptyState title={t('rules')} body={t('emptyRules')} actionLabel={t('ruleName')} actionHref="#rule-name" />
    {:else}
    <ResponsiveList label={t('rules')}>
      {#each rules as rule (rule.id)}
      <li><article class="item">
        <div><strong>{rule.name}</strong><small>{ruleSummary(rule)}</small></div>
        <MoneyDisplay amount={rule.amount} />
        <StatusBadge tone="neutral">{rule.mode==='auto'?t('modeAuto'):t('modeManual')}</StatusBadge>
        {#if rule.status!=='archived'}<span class="actions"><Button size="sm" variant="outline" onclick={()=>editRule(rule)}>{t('editAction')}</Button><Button size="sm" variant="outline" onclick={()=>ruleAction(rule,rule.status==='paused'?'active':'paused')}>{rule.status==='paused'?t('resume'):t('pause')}</Button><Button size="sm" variant="ghost" onclick={()=>archiveTarget=rule}>{t('archive')}</Button></span>{/if}
      </article></li>
      {/each}
    </ResponsiveList>
    {/if}
  </Card.Content></Card.Root>
  <AlertDialog.Root open={!!archiveTarget} onOpenChange={(v)=>{if(!v)archiveTarget=null;}}>
    <AlertDialog.Content>
      <AlertDialog.Header><AlertDialog.Title>{t('archiveTitle')}</AlertDialog.Title><AlertDialog.Description>{t('archiveBody')}</AlertDialog.Description></AlertDialog.Header>
      <AlertDialog.Footer><AlertDialog.Cancel onclick={()=>archiveTarget=null}>{t('cancel')}</AlertDialog.Cancel><AlertDialog.Action onclick={confirmArchive}>{t('archive')}</AlertDialog.Action></AlertDialog.Footer>
    </AlertDialog.Content>
  </AlertDialog.Root>
{/if}
<style>
 .grid{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,.8fr);gap:16px;align-items:start}
 :global(.rules){margin-top:16px}
 .item{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
 .item>div:first-child{flex:1;display:grid;gap:3px;min-width:140px}
 .item small{color:var(--muted-foreground)}
 .actions{display:flex;gap:4px;flex-wrap:wrap}
 .two{display:grid;grid-template-columns:1fr 100px;gap:8px}
 .notice{color:var(--income-ink);font-size:13px}
 @media(max-width:850px){.grid{grid-template-columns:minmax(0,1fr)}}
</style>
