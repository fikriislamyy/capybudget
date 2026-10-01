<script lang="ts">
  import {getContext as privacyContext} from 'svelte';
  import {concealed,PRIVACY_CONTEXT,type PrivacyState} from '$lib/privacy';
  const privacy=privacyContext<PrivacyState>(PRIVACY_CONTEXT);
  import { getContext } from 'svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import * as Card from '$lib/components/ui/card';
  import * as Field from '$lib/components/ui/field';
  import { getContext as getUiContext } from 'svelte';
  import { AUTH_UI_CONTEXT, type AuthUiState } from '$lib/i18n/auth';
  import { trackingText } from '$lib/i18n/tracking';

  type State={selectedId:string;ready:boolean};
  type Account={id:string;name:string;kind:string;currency:string;balance:string;openingBalance:string;archivedAt?:string|null};
  const workspace=getContext<State>('capybudget-workspaces');
  const authUi=getUiContext<AuthUiState>(AUTH_UI_CONTEXT);const t=(key:Parameters<typeof trackingText>[1])=>trackingText(authUi.locale,key);
  let accounts=$state<Account[]>([]),name=$state(''),kind=$state('cash'),openingBalance=$state('0'),error=$state(''),busy=$state(false),loading=$state(true);
  let reloadKey=$state(0),requestSequence=0;
  $effect(()=>{void (workspace as {revision?:number}).revision;const id=workspace.selectedId;const key=reloadKey;if(id)void load(id);});
  async function load(id:string){
    const sequence=++requestSequence;loading=true;error='';
    try{const r=await fetch('/api/workspaces/'+id+'/accounts');const j=await r.json();if(sequence!==requestSequence)return;if(!r.ok)throw new Error(j.message??'Unable to load accounts.');accounts=j.items;}
    catch(e){if(sequence===requestSequence)error=e instanceof Error?e.message:'Unable to load accounts.';}
    finally{if(sequence===requestSequence)loading=false;}
  }
  async function create(event:SubmitEvent){
    event.preventDefault();if(busy||!workspace.selectedId)return;busy=true;error='';
    try{
      const r=await fetch('/api/workspaces/'+workspace.selectedId+'/accounts',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name,kind,openingBalance})});
      const j=await r.json();if(!r.ok)throw new Error(j.message??'Unable to create account.');
      name='';openingBalance='0';reloadKey++;
    }catch(e){error=e instanceof Error?e.message:'Unable to create account.';}
    finally{busy=false;}
  }
  async function archive(account:Account){if(!confirm(`Archive ${account.name}? Past transactions will remain in history.`))return;try{const r=await fetch(`/api/workspaces/${workspace.selectedId}/accounts/${account.id}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({archived:true})});const j=await r.json();if(!r.ok)throw new Error(j.message??'Unable to archive account.');reloadKey++;}catch(e){error=e instanceof Error?e.message:'Unable to archive account.';}}
  async function rename(account:Account){const value=prompt('Account name',account.name)?.trim();if(!value||value===account.name)return;try{const r=await fetch(`/api/workspaces/${workspace.selectedId}/accounts/${account.id}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({name:value})});const j=await r.json();if(!r.ok)throw new Error(j.message??'Unable to rename account.');reloadKey++;}catch(e){error=e instanceof Error?e.message:'Unable to rename account.';}}
</script>

<div class="heading"><div><p class="eyebrow">YOUR MONEY, ORGANIZED</p><h1>{t('accountHeading')}</h1><p class="muted">{t('accountIntro')}</p></div></div>
{#if !workspace.ready}<p role="status">{t('loading')}</p>
{:else if !workspace.selectedId}<p role="alert">{t('chooseWorkspace')}</p>
{:else}
  <div class="grid">
    <Card.Root><Card.Header><Card.Title>{t('yourAccounts')}</Card.Title><Card.Description>{t('accountDescription')}</Card.Description></Card.Header>
      <Card.Content>
        {#if loading}<p role="status">Loading accounts…</p>
        {:else if accounts.length===0}<p class="empty">No accounts yet. Add your first wallet.</p>
        {:else}<div class="accounts">{#each accounts as account (account.id)}
          <article class="account"><span class="account-icon" aria-hidden="true">{account.kind==='cash'?'◉':account.kind==='credit_card'?'▤':'↗'}</span><div class="account-copy"><strong>{account.name}</strong><small>{account.kind.replace('_',' ')} · {account.currency}</small></div><strong class="balance">{account.currency} {concealed(account.balance,privacy.hidden)}</strong><Button size="sm" variant="ghost" onclick={()=>rename(account)} aria-label="Rename account">Edit</Button><Button size="sm" variant="ghost" onclick={()=>archive(account)} aria-label="Archive account">{t('archive')}</Button></article>
        {/each}</div>{/if}
      </Card.Content>
    </Card.Root>
    <Card.Root><Card.Header><Card.Title>{t('addAccount')}</Card.Title><Card.Description>{t('openingHint')}</Card.Description></Card.Header>
      <Card.Content><form onsubmit={create}><Field.FieldGroup>
        <Field.Field><Field.FieldLabel for="account-name">{t('accountName')}</Field.FieldLabel><Input id="account-name" bind:value={name} maxlength={100} required placeholder="Everyday bank" /></Field.Field>
        <Field.Field><Field.FieldLabel for="account-kind">{t('accountType')}</Field.FieldLabel><select id="account-kind" bind:value={kind}><option value="cash">Cash</option><option value="bank">Bank</option><option value="e_wallet">E-wallet</option><option value="credit_card">Credit card</option><option value="savings">Savings</option><option value="investment">Investment wallet</option></select></Field.Field>
        <Field.Field><Field.FieldLabel for="opening">{t('openingBalance')}</Field.FieldLabel><Input id="opening"  type={privacy.hidden?'password':'text'} bind:value={openingBalance} inputmode="decimal" required /></Field.Field>
        {#if error}<p class="error" role="alert">{error}</p>{/if}
        <Button type="submit" disabled={busy}>{busy?t('saving'):t('addAccount')}</Button>
      </Field.FieldGroup></form></Card.Content>
    </Card.Root>
  </div>
{/if}

<style>
  .heading{display:flex;align-items:center;justify-content:space-between;margin-bottom:25px}.eyebrow{font-size:11px;letter-spacing:1px;font-weight:700;color:var(--muted-foreground);margin:0 0 6px}h1{font:500 34px 'Fredoka Variable',sans-serif;margin:0}.muted,.empty{color:var(--muted-foreground);margin:7px 0 0}.grid{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(280px,.8fr);gap:18px}.accounts{display:grid}.account{display:flex;align-items:center;gap:12px;padding:14px 0;border-bottom:1px solid var(--border)}.account:last-child{border:0}.account-icon{display:grid;place-items:center;width:42px;height:42px;border-radius:14px;background:var(--secondary);color:var(--secondary-foreground);font-size:20px}.account-copy{display:grid;gap:3px;flex:1}.account-copy small{color:var(--muted-foreground);text-transform:capitalize}.balance{font-variant-numeric:tabular-nums}.error{color:var(--destructive);font-size:13px}select{height:40px;border:1px solid var(--input);border-radius:var(--radius);background:var(--background);color:var(--foreground);padding:0 10px}
  @media(max-width:850px){.grid{grid-template-columns:1fr}}@media(max-width:500px){h1{font-size:29px}.account{flex-wrap:wrap}.balance{margin-left:auto}}
</style>
