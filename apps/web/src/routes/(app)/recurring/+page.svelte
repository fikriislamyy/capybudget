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
  type Account={id:string;name:string};type Category={id:string;name:string;type:string};
  type Rule={id:string;name:string;type:string;accountId:string;destinationAccountId?:string;categoryId?:string;amount:string;frequency:string;interval:number;anchorDate:string;endDate?:string|null;nextDueDate:string;mode:string;status:string;version:number};
  type Occurrence={id:string;ruleName:string;date:string;status:string;amount:string;currency:string};
  const workspace=getContext<State>('capybudget-workspaces');
  const authUi=getContext<AuthUiState>(AUTH_UI_CONTEXT);const t=(key:Parameters<typeof trackingText>[1])=>trackingText(authUi.locale,key);
  let accounts=$state<Account[]>([]),categories=$state<Category[]>([]),rules=$state<Rule[]>([]),occurrences=$state<Occurrence[]>([]);
  let name=$state(''),type=$state('expense'),accountId=$state(''),destinationId=$state(''),categoryId=$state(''),amount=$state(''),frequency=$state('month'),interval=$state(1),mode=$state('manual'),anchorDate=$state(today()),endDate=$state(''),busy=$state(false),loading=$state(true),error=$state(''),notice=$state(''),reload=$state(0),editingRule=$state<Rule|null>(null),requestSequence=0;
  function today(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta'}).format(new Date());}
  $effect(()=>{void (workspace as {revision?:number}).revision;const id=workspace.selectedId,key=reload;if(id)void load(id);});
  async function load(id:string){const sequence=++requestSequence;loading=true;error='';try{
    await fetch(`/api/workspaces/${id}/recurring-occurrences/materialize`,{method:'POST'});
    const [a,c,r,o]=await Promise.all([fetch(`/api/workspaces/${id}/accounts`).then(x=>x.json()),fetch(`/api/workspaces/${id}/categories`).then(x=>x.json()),fetch(`/api/workspaces/${id}/recurring-rules`).then(x=>x.json()),fetch(`/api/workspaces/${id}/recurring-occurrences`).then(x=>x.json())]);
    if(sequence!==requestSequence)return;accounts=a.items;categories=c.items;rules=r.items;occurrences=o.items;if(!accountId&&accounts.length)accountId=accounts[0].id;
  }catch(e){if(sequence===requestSequence)error=e instanceof Error?e.message:'Unable to load recurring transactions.';}finally{if(sequence===requestSequence)loading=false;}}
  async function create(e:SubmitEvent){e.preventDefault();if(busy||!workspace.selectedId)return;busy=true;error='';notice='';
    try{const payload:any={name,type,accountId,amount,frequency,interval,mode,anchorDate,endDate:endDate||null};if(type==='transfer')payload.destinationAccountId=destinationId;else payload.categoryId=categoryId;
      const url=editingRule?`/api/workspaces/${workspace.selectedId}/recurring-rules/${editingRule.id}`:`/api/workspaces/${workspace.selectedId}/recurring-rules`;
      const r=await fetch(url,{method:editingRule?'PATCH':'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...payload,...(editingRule?{version:editingRule.version}:{})})});const j=await r.json();if(!r.ok)throw new Error(j.message??'Unable to save recurring rule.');name='';amount='';endDate='';editingRule=null;notice='Recurring rule saved.';reload++;
    }catch(e){error=e instanceof Error?e.message:'Unable to create recurring rule.';}finally{busy=false;}}
  async function action(item:Occurrence,verb:'confirm'|'skip'){error='';try{const r=await fetch(`/api/workspaces/${workspace.selectedId}/recurring-occurrences/${item.id}/${verb}`,{method:'POST'});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.message??'Unable to update this occurrence.');notice=verb==='confirm'?'Occurrence recorded.':'Occurrence skipped.';reload++;}catch(e){error=e instanceof Error?e.message:'Unable to update this occurrence.';}}
  async function ruleAction(rule:Rule,status:'paused'|'active'|'archived'){if(status==='archived'&&!confirm(`Archive ${rule.name}?`))return;try{const r=await fetch(`/api/workspaces/${workspace.selectedId}/recurring-rules/${rule.id}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({status,version:rule.version})});const j=await r.json();if(!r.ok)throw new Error(j.message??'Unable to update recurring rule.');notice='Recurring rule updated.';reload++;}catch(e){error=e instanceof Error?e.message:'Unable to update recurring rule.';}}
  function editRule(rule:Rule){editingRule=rule;name=rule.name;type=rule.type;accountId=rule.accountId;destinationId=rule.destinationAccountId??'';categoryId=rule.categoryId??'';amount=rule.amount;frequency=rule.frequency;interval=rule.interval;mode=rule.mode;anchorDate=rule.anchorDate;endDate=rule.endDate??'';}
</script>

<div class="heading"><div><p class="eyebrow">AUTOMATE ROUTINE TRACKING</p><h1>{t('recurringHeading')}</h1><p class="muted">{t('recurringIntro')}</p></div></div>
{#if !workspace.ready}<p role="status">{t('loading')}</p>{:else if !workspace.selectedId}<p role="alert">{t('chooseWorkspace')}</p>{:else}
  <div class="grid"><Card.Root><Card.Header><Card.Title>{t('upcoming')}</Card.Title><Card.Description>Manual entries need confirmation on or after their due date.</Card.Description></Card.Header><Card.Content>
    {#if loading}<p role="status">{t('loading')}</p>{:else if occurrences.length===0}<p class="muted">Nothing scheduled in the next 30 days.</p>{:else}<div class="list">{#each occurrences as item (item.id)}<article class="item"><div><strong>{item.ruleName}</strong><small>{item.date} · {item.status}</small></div><strong>{item.currency} {concealed(item.amount,privacy.hidden)}</strong>{#if item.status==='pending'}<div class="actions"><Button size="sm" onclick={()=>action(item,'confirm')}>{t('confirm')}</Button><Button size="sm" variant="outline" onclick={()=>action(item,'skip')}>{t('skip')}</Button></div>{/if}</article>{/each}</div>{/if}
  </Card.Content></Card.Root>
  <Card.Root><Card.Header><Card.Title>{editingRule?'Edit recurring rule':t('addRule')}</Card.Title><Card.Description>Auto mode records bookkeeping entries. It does not move money at a bank.</Card.Description></Card.Header><Card.Content><form onsubmit={create}><Field.FieldGroup>
    <Field.Field><Field.FieldLabel for="rule-name">Name</Field.FieldLabel><Input id="rule-name" bind:value={name} required maxlength={100} placeholder="Monthly salary" /></Field.Field>
    <Field.Field><Field.FieldLabel for="rule-type">Type</Field.FieldLabel><select id="rule-type" bind:value={type}><option value="expense">Expense</option><option value="income">Income</option><option value="transfer">Transfer</option></select></Field.Field>
    <Field.Field><Field.FieldLabel for="rule-amount">Amount</Field.FieldLabel><Input id="rule-amount"  type={privacy.hidden?'password':'text'} bind:value={amount} inputmode="decimal" required /></Field.Field>
    <Field.Field><Field.FieldLabel for="rule-account">Account</Field.FieldLabel><select id="rule-account" bind:value={accountId} required>{#each accounts as a}<option value={a.id}>{a.name}</option>{/each}</select></Field.Field>
    {#if type==='transfer'}<Field.Field><Field.FieldLabel for="rule-destination">To account</Field.FieldLabel><select id="rule-destination" bind:value={destinationId} required>{#each accounts.filter(a=>a.id!==accountId) as a}<option value={a.id}>{a.name}</option>{/each}</select></Field.Field>
    {:else}<Field.Field><Field.FieldLabel for="rule-category">Category</Field.FieldLabel><select id="rule-category" bind:value={categoryId} required>{#each categories.filter(c=>c.type===type) as c}<option value={c.id}>{c.name}</option>{/each}</select></Field.Field>{/if}
    <div class="two"><Field.Field><Field.FieldLabel for="frequency">Repeat</Field.FieldLabel><select id="frequency" bind:value={frequency}><option value="day">Daily</option><option value="week">Weekly</option><option value="month">Monthly</option><option value="year">Yearly</option></select></Field.Field><Field.Field><Field.FieldLabel for="interval">Every</Field.FieldLabel><Input id="interval" type="number" min="1" max="365" bind:value={interval} required /></Field.Field></div>
    <Field.Field><Field.FieldLabel for="anchor-date">First date</Field.FieldLabel><Input id="anchor-date" type="date" bind:value={anchorDate} required /></Field.Field>
    <Field.Field><Field.FieldLabel for="end-date">End date (optional)</Field.FieldLabel><Input id="end-date" type="date" bind:value={endDate} /></Field.Field>
    <Field.Field><Field.FieldLabel for="mode">Posting behavior</Field.FieldLabel><select id="mode" bind:value={mode}><option value="manual">Ask me to confirm</option><option value="auto">Automatically record</option></select></Field.Field>
    {#if error}<p class="error" role="alert">{error}</p>{/if}{#if notice}<p class="notice" role="status">{notice}</p>{/if}{#if editingRule}<Button type="button" variant="outline" onclick={()=>editingRule=null}>{t('cancel')}</Button>{/if}<Button type="submit" disabled={busy}>{busy?t('saving'):'Save recurring rule'}</Button>
  </Field.FieldGroup></form></Card.Content></Card.Root></div>
  <Card.Root class="rules"><Card.Header><Card.Title>{t('rules')}</Card.Title></Card.Header><Card.Content>{#if rules.length===0}<p class="muted">{t('emptyRules')}</p>{:else}<div class="list">{#each rules as rule (rule.id)}<article class="item"><div><strong>{rule.name}</strong><small>{rule.status} · every {rule.interval} {rule.frequency}(s) · next {rule.nextDueDate}</small></div><strong>{concealed(rule.amount,privacy.hidden)}</strong><small>{rule.mode}</small>{#if rule.status!=='archived'}<Button size="sm" variant="outline" onclick={()=>editRule(rule)}>Edit</Button><Button size="sm" variant="outline" onclick={()=>ruleAction(rule,rule.status==='paused'?'active':'paused')}>{rule.status==='paused'?t('resume'):t('pause')}</Button><Button size="sm" variant="ghost" onclick={()=>ruleAction(rule,'archived')}>{t('archive')}</Button>{/if}</article>{/each}</div>{/if}</Card.Content></Card.Root>
{/if}
<style>
 .heading{margin-bottom:24px}.eyebrow{font-size:11px;letter-spacing:1px;font-weight:700;color:var(--muted-foreground);margin:0 0 6px}h1{font:500 34px 'Fredoka Variable',sans-serif;margin:0}.muted{color:var(--muted-foreground);margin:7px 0 0}.grid{display:grid;grid-template-columns:1.2fr .8fr;gap:18px;align-items:start}:global(.rules){margin-top:18px}.list{display:grid}.item{display:flex;align-items:center;gap:12px;padding:13px 0;border-bottom:1px solid var(--border)}.item:last-child{border:0}.item>div:first-child{flex:1;display:grid;gap:3px}.item small{color:var(--muted-foreground)}.actions{display:flex;gap:6px}.two{display:grid;grid-template-columns:1fr 100px;gap:10px}.error{color:var(--destructive)}.notice{color:var(--primary)}select{min-height:40px;border:1px solid var(--input);border-radius:var(--radius);background:var(--background);color:var(--foreground);padding:8px 10px}@media(max-width:850px){.grid{grid-template-columns:1fr}}@media(max-width:500px){h1{font-size:29px}.item{flex-wrap:wrap}.actions{margin-left:auto}}
</style>
