<script lang="ts">
  import {getContext as privacyContext} from 'svelte';
  import {concealed,PRIVACY_CONTEXT,type PrivacyState} from '$lib/privacy';
  const privacy=privacyContext<PrivacyState>(PRIVACY_CONTEXT);
  import { getContext } from 'svelte';
  import { AUTH_UI_CONTEXT, type AuthUiState } from '$lib/i18n/auth';
  import { financeText } from '$lib/i18n/finance';
  import { Button } from '$lib/components/ui/button';
  import * as Card from '$lib/components/ui/card';
  import * as Field from '$lib/components/ui/field';
  import { Input } from '$lib/components/ui/input';
  type WorkspaceState={selectedId:string;ready:boolean}; type Budget={id:string;name:string;categoryId:string;categoryName:string;cadence:'weekly'|'monthly';amount:string;currency:string;spent:string;remaining:string;usedPercent:number|null;alertThresholds:number[];period:{from:string;to:string}};
  type Category={id:string;name:string;type:string};
  const workspace=getContext<WorkspaceState>('capybudget-workspaces'), ui=getContext<AuthUiState>(AUTH_UI_CONTEXT);
  const t=(key:Parameters<typeof financeText>[1])=>financeText(ui.locale,key);
  let items:Budget[]=$state([]),categories:Category[]=$state([]),loading=$state(true),error=$state(''),name=$state(''),amount=$state(''),categoryId=$state(''),cadence=$state<'weekly'|'monthly'>('monthly'),saving=$state(false),thresholds:Record<string,string>=$state({});
  async function load(){if(!workspace.ready||!workspace.selectedId)return;loading=true;try{const [b,c]=await Promise.all([fetch(`/api/workspaces/${workspace.selectedId}/budgets`),fetch(`/api/workspaces/${workspace.selectedId}/categories`)]);if(!b.ok||!c.ok)throw new Error(t('error'));items=(await b.json()).items;categories=(await c.json()).items.filter((x:Category)=>x.type==='expense');}catch(e){error=e instanceof Error?e.message:t('error');}finally{loading=false;}}
  $effect(()=>{void (workspace as {revision?:number}).revision;if(workspace.ready&&workspace.selectedId)void load();});
  async function create(event:SubmitEvent){event.preventDefault();if(saving)return;saving=true;error='';try{const response=await fetch(`/api/workspaces/${workspace.selectedId}/budgets`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name,amount,categoryId,cadence,alertThresholds:[80,100]})});const body=await response.json();if(!response.ok)throw new Error(body.message);name='';amount='';await load();}catch(e){error=e instanceof Error?e.message:t('error');}finally{saving=false;}}
  async function archive(id:string){await fetch(`/api/workspaces/${workspace.selectedId}/budgets/${id}`,{method:'DELETE'});await load();}
  async function saveThresholds(event:SubmitEvent,id:string){event.preventDefault();try{const values=(thresholds[id]??'80,100').split(',').map((value)=>Number(value.trim()));const response=await fetch(`/api/workspaces/${workspace.selectedId}/budgets/${id}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({alertThresholds:values})});const body=await response.json();if(!response.ok)throw new Error(body.message);await load();}catch(e){error=e instanceof Error?e.message:t('error');}}
</script>
<svelte:head><title>CapyBudget · {t('budgets')}</title></svelte:head>
<div class="page-head"><div><p class="eyebrow">Personal finance</p><h1>{t('budgets')}</h1><p>Give each category a comfortable spending pond.</p><p class="caption">{t('thresholdPolicy')}</p></div></div>
{#if error}<p role="alert" class="error">{error}</p>{/if}
<div class="grid">
  <Card.Root><Card.Header><Card.Title>{t('addBudget')}</Card.Title><Card.Description>Weekly or calendar month. Expenses reduce the remaining amount.</Card.Description></Card.Header><Card.Content>
    <form onsubmit={create}><Field.FieldGroup>
      <Field.Field><Field.FieldLabel for="budget-name">{t('name')}</Field.FieldLabel><Input id="budget-name" bind:value={name} maxlength={100} required /></Field.Field>
      <Field.Field><Field.FieldLabel for="budget-category">{t('category')}</Field.FieldLabel><select id="budget-category" bind:value={categoryId} required><option value="">{t('category')}</option>{#each categories as item}<option value={item.id}>{item.name}</option>{/each}</select></Field.Field>
      <Field.Field><Field.FieldLabel for="budget-amount">{t('amount')}</Field.FieldLabel><Input id="budget-amount" inputmode="decimal"  type={privacy.hidden?'password':'text'} bind:value={amount} required /></Field.Field>
      <Field.Field><Field.FieldLabel for="budget-cadence">{t('cadence')}</Field.FieldLabel><select id="budget-cadence" bind:value={cadence}><option value="weekly">{t('weekly')}</option><option value="monthly">{t('monthly')}</option></select></Field.Field>
    </Field.FieldGroup><Button class="submit" type="submit" disabled={saving||!workspace.selectedId}>{saving?'…':t('addBudget')}</Button></form>
  </Card.Content></Card.Root>
  <section class="list" aria-label={t('budgets')}>
    {#if loading}<p>{t('loading')}</p>{:else if items.length===0}<Card.Root><Card.Content><p>{t('emptyBudgets')}</p></Card.Content></Card.Root>{:else}
      {#each items as item (item.id)}<Card.Root><Card.Header><div class="title-row"><div><Card.Title>{item.categoryName}</Card.Title><Card.Description>{item.name} · {item.cadence==='weekly'?t('weekly'):t('monthly')} · {item.period.from}—{item.period.to}</Card.Description></div><Button variant="ghost" size="sm" onclick={()=>archive(item.id)}>{t('archive')}</Button></div></Card.Header><Card.Content>
        <div class="numbers"><span>{t('spent')} <strong>{item.currency} {item.spent}</strong></span><span>{t('remaining')} <strong>{item.currency} {concealed(item.remaining,privacy.hidden)}</strong></span></div>
        {#if privacy.hidden}<p class="caption">••••••</p>{:else if item.usedPercent===null}<p class="caption">{t('zeroBudgetSpend')}</p>{:else}<progress aria-label={`${item.categoryName} budget ${item.usedPercent.toFixed(0)}% used`} max="100" value={Math.min(100,item.usedPercent)}></progress><p class="caption">{item.usedPercent.toFixed(1)}% used</p>{/if}
        <form class="thresholds" onsubmit={(event)=>saveThresholds(event,item.id)}><label for={`thresholds-${item.id}`}>{t('thresholds')}</label><Input id={`thresholds-${item.id}`} bind:value={thresholds[item.id]} placeholder={item.alertThresholds.join(',')} /><Button variant="outline" size="sm" type="submit">{t('save')}</Button></form>
      </Card.Content></Card.Root>{/each}
    {/if}
  </section>
</div>
<style>
  .page-head{margin-bottom:24px}.eyebrow{color:var(--muted-foreground);font-size:13px;margin:0 0 5px}h1{font:500 clamp(28px,4vw,38px) 'Fredoka Variable',sans-serif;margin:0} .page-head p:last-child{color:var(--muted-foreground);margin:8px 0 0}.grid{display:grid;grid-template-columns:minmax(250px,350px) minmax(0,1fr);gap:20px;align-items:start}.list{display:grid;gap:14px}.title-row,.numbers{display:flex;justify-content:space-between;gap:12px;align-items:center}.numbers{align-items:flex-start;margin-bottom:14px;flex-wrap:wrap}.numbers span{display:grid;color:var(--muted-foreground);font-size:13px}.numbers strong{font-size:20px;color:var(--foreground);font-variant-numeric:tabular-nums}progress{width:100%;height:13px;accent-color:#5BB8D4}.caption{margin:5px 0 0;font-size:12px;color:var(--muted-foreground);font-variant-numeric:tabular-nums}.thresholds{display:flex;gap:9px;align-items:center;margin-top:14px;flex-wrap:wrap}.thresholds label{font-size:12px;color:var(--muted-foreground)}.thresholds :global(input){width:92px}:global(.submit){margin-top:18px;width:100%}.error{color:var(--destructive)}select{width:100%;height:40px;border:1px solid var(--input);border-radius:var(--radius);background:var(--background);color:var(--foreground);padding:8px}.grid :global([data-slot=field-group]){gap:14px}@media(max-width:760px){.grid{grid-template-columns:1fr}}
</style>
