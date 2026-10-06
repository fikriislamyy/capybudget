<script lang="ts">
  import BudgetMethods from '$lib/components/personal-finance/budget-methods.svelte';
  import { formatDate } from '$lib/dates';
  import BudgetPond from '$lib/components/shared/budget-pond.svelte';
  import AmountInput from '$lib/components/forms/amount-input.svelte';
  import LoadingScope from '$lib/components/shared/loading-scope.svelte';
  import ChoiceSelect from '$lib/components/forms/choice-select.svelte';
  import {getContext as privacyContext} from 'svelte';
  import {PRIVACY_CONTEXT,type PrivacyState} from '$lib/privacy';
  const privacy=privacyContext<PrivacyState>(PRIVACY_CONTEXT);
  import { getContext } from 'svelte';
  import { AUTH_UI_CONTEXT, type AuthUiState } from '$lib/i18n/auth';
  import { financeText } from '$lib/i18n/finance';
  import { uxText } from '$lib/i18n/ux';
  import { Button } from '$lib/components/ui/button';
  import * as Card from '$lib/components/ui/card';
  import * as Field from '$lib/components/ui/field';
  import { Input } from '$lib/components/ui/input';
  import * as AlertDialog from '$lib/components/ui/alert-dialog';
  import PageHeader from '$lib/components/shared/page-header.svelte';
  import MoneyDisplay from '$lib/components/shared/money-display.svelte';
  import EmptyState from '$lib/components/shared/empty-state.svelte';
  import ErrorState from '$lib/components/shared/error-state.svelte';
  import LoadingSkeleton from '$lib/components/shared/loading-skeleton.svelte';
  type WorkspaceState={selectedId:string;ready:boolean}; type Budget={id:string;name:string;categoryId:string;categoryName:string;cadence:'weekly'|'monthly';amount:string;currency:string;spent:string;remaining:string;usedPercent:number|null;alertThresholds:number[];period:{from:string;to:string}};
  type Category={id:string;name:string;type:string};
  const workspace=getContext<WorkspaceState>('capybudget-workspaces'), ui=getContext<AuthUiState>(AUTH_UI_CONTEXT);
  const t=(key:Parameters<typeof financeText>[1])=>financeText(ui.locale,key);
  const ux=(key:Parameters<typeof uxText>[1])=>uxText(ui.locale,key);
  let items:Budget[]=$state([]),categories:Category[]=$state([]),loading=$state(true),error=$state(''),name=$state(''),amount=$state(''),categoryId=$state(''),cadence=$state<'weekly'|'monthly'>('monthly'),saving=$state(false),thresholds:Record<string,string>=$state({}),archiveTarget=$state<Budget|null>(null);
  async function load(){if(!workspace.ready||!workspace.selectedId)return;loading=true;try{const [b,c]=await Promise.all([fetch(`/api/workspaces/${workspace.selectedId}/budgets`),fetch(`/api/workspaces/${workspace.selectedId}/categories`)]);if(!b.ok||!c.ok)throw new Error(t('error'));items=(await b.json()).items;categories=(await c.json()).items.filter((x:Category)=>x.type==='expense');}catch(e){error=e instanceof Error?e.message:t('error');}finally{loading=false;}}
  $effect(()=>{void (workspace as {revision?:number}).revision;if(workspace.ready&&workspace.selectedId)void load();});
  async function create(event:SubmitEvent){event.preventDefault();if(saving)return;saving=true;error='';try{const response=await fetch(`/api/workspaces/${workspace.selectedId}/budgets`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name,amount,categoryId,cadence,alertThresholds:[80,100]})});const body=await response.json();if(!response.ok)throw new Error(body.message);name='';amount='';await load();}catch(e){error=e instanceof Error?e.message:t('error');}finally{saving=false;}}
  async function confirmArchive(){const target=archiveTarget;if(!target)return;archiveTarget=null;await fetch(`/api/workspaces/${workspace.selectedId}/budgets/${target.id}`,{method:'DELETE'});await load();}
  async function saveThresholds(event:SubmitEvent,id:string){event.preventDefault();try{const values=(thresholds[id]??'80,100').split(',').map((value)=>Number(value.trim()));const response=await fetch(`/api/workspaces/${workspace.selectedId}/budgets/${id}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({alertThresholds:values})});const body=await response.json();if(!response.ok)throw new Error(body.message);await load();}catch(e){error=e instanceof Error?e.message:t('error');}}
</script>
<LoadingScope active={!!loading || !!saving} />
<svelte:head><title>CapyBudget · {t('budgets')}</title></svelte:head>
<PageHeader eyebrow={t('financeEyebrow').toUpperCase()} title={t('budgets')} description={t('budgetIntro')} />
<p class="caption top">{t('thresholdPolicy')}</p>
{#if error}<ErrorState title={ux('errorTitle')} message={error} retryLabel={ux('retry')} onRetry={load} />{/if}
<div class="grid">
  <Card.Root><Card.Header><Card.Title>{t('addBudget')}</Card.Title><Card.Description>{t('budgetFormHint')}</Card.Description></Card.Header><Card.Content>
    <form onsubmit={create}><Field.FieldGroup>
      <Field.Field><Field.FieldLabel for="budget-name">{t('name')}</Field.FieldLabel><Input id="budget-name" bind:value={name} maxlength={100} required /></Field.Field>
      <Field.Field><Field.FieldLabel for="budget-category">{t('category')}</Field.FieldLabel><ChoiceSelect id="budget-category" bind:value={categoryId} required items={[{value: '', label: String(t('category'))}, ...(categories).flatMap((item) => [{value: item.id, label: String(item.name)}])]} /></Field.Field>
      <Field.Field><Field.FieldLabel for="budget-amount">{t('amount')}</Field.FieldLabel><AmountInput id="budget-amount" inputmode="decimal" type={privacy.hidden?'password':'text'} bind:value={amount} required /></Field.Field>
      <Field.Field><Field.FieldLabel for="budget-cadence">{t('cadence')}</Field.FieldLabel><ChoiceSelect id="budget-cadence" bind:value={cadence} items={[{value: "weekly", label: String(t('weekly'))}, {value: "monthly", label: String(t('monthly'))}]} /></Field.Field>
    </Field.FieldGroup><Button class="submit" type="submit" disabled={saving||!workspace.selectedId}>{saving?'…':t('addBudget')}</Button></form>
  </Card.Content></Card.Root>
  <section class="list" aria-label={t('budgets')}>
    {#if loading}<LoadingSkeleton rows={3} label={t('loading')} />{:else if items.length===0}<Card.Root><Card.Content><EmptyState title={t('budgets')} body={t('emptyBudgets')} actionLabel={t('addBudget')} actionHref="#budget-name" /></Card.Content></Card.Root>{:else}
      {#each items as item (item.id)}<Card.Root><Card.Header><div class="title-row"><div><Card.Title>{item.categoryName}</Card.Title><Card.Description>{item.name} · {item.cadence==='weekly'?t('weekly'):t('monthly')} · {formatDate(item.period.from)}—{formatDate(item.period.to)}</Card.Description></div><Button variant="ghost" size="sm" onclick={()=>archiveTarget=item}>{t('archive')}</Button></div></Card.Header><Card.Content>
        <div class="numbers"><span>{t('spent')} <MoneyDisplay amount={item.spent} currency={item.currency} type="expense" size="lg" /></span><span>{t('remaining')} <MoneyDisplay amount={item.remaining} currency={item.currency} size="lg" /></span></div>
        <BudgetPond name={item.name} usedPercent={item.usedPercent} />
        {#if !privacy.hidden && item.usedPercent===null}<p class="caption">{t('zeroBudgetSpend')}</p>{/if}
        <form class="thresholds" onsubmit={(event)=>saveThresholds(event,item.id)}><label for={`thresholds-${item.id}`}>{t('thresholds')}</label><Input id={`thresholds-${item.id}`} bind:value={thresholds[item.id]} placeholder={item.alertThresholds.join(',')} aria-describedby={`threshold-help-${item.id}`} /><Button variant="outline" size="sm" type="submit">{t('save')}</Button></form><p id={`threshold-help-${item.id}`} class="caption">{ui.locale==='id'?'Masukkan persentase dipisahkan koma, misalnya 80,100. Peringatan dikirim sekali per ambang dalam setiap periode.':'Enter percentages separated by commas, such as 80,100. Each threshold alerts once per budget period.'}</p>
      </Card.Content></Card.Root>{/each}
    {/if}
  </section>
</div>
<BudgetMethods />
<AlertDialog.Root open={!!archiveTarget} onOpenChange={(v)=>{if(!v)archiveTarget=null;}}>
  <AlertDialog.Content>
    <AlertDialog.Header><AlertDialog.Title>{t('archiveBudgetTitle')}</AlertDialog.Title><AlertDialog.Description>{t('archiveBody')}</AlertDialog.Description></AlertDialog.Header>
    <AlertDialog.Footer><AlertDialog.Cancel onclick={()=>archiveTarget=null}>{t('cancel')}</AlertDialog.Cancel><AlertDialog.Action onclick={confirmArchive}>{t('archive')}</AlertDialog.Action></AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
<style>
  .caption{margin:4px 0 0;font-size:12px;color:var(--muted-foreground);font-variant-numeric:tabular-nums}
  .caption.top{margin:-14px 0 16px}
  .grid{display:grid;grid-template-columns:minmax(250px,350px) minmax(0,1fr);gap:16px;align-items:start}
  .list{display:grid;gap:16px;min-width:0}
  .title-row,.numbers{display:flex;justify-content:space-between;gap:12px;align-items:center}
  .numbers{align-items:flex-start;margin-bottom:12px;flex-wrap:wrap}
  .numbers span{display:grid;color:var(--muted-foreground);font-size:13px;gap:2px}
  .thresholds{display:flex;gap:8px;align-items:center;margin-top:12px;flex-wrap:wrap}
  .thresholds label{font-size:12px;color:var(--muted-foreground)}
  .thresholds :global(input){width:92px}
  :global(.submit){margin-top:16px;width:100%}
  :global([data-slot="select-trigger"]){width:100%}
  .grid :global([data-slot=field-group]){gap:12px}
  @media(max-width:760px){.grid{grid-template-columns:minmax(0,1fr)}}
</style>
