<script lang="ts">
  import AmountInput from '$lib/components/forms/amount-input.svelte';
  import LoadingScope from '$lib/components/shared/loading-scope.svelte';
  import ChoiceSelect from '$lib/components/forms/choice-select.svelte';
  import {getContext as privacyContext} from 'svelte';
  import {PRIVACY_CONTEXT,type PrivacyState} from '$lib/privacy';
  const privacy=privacyContext<PrivacyState>(PRIVACY_CONTEXT);
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
  import { AUTH_UI_CONTEXT, type AuthUiState } from '$lib/i18n/auth';
  import { trackingText } from '$lib/i18n/tracking';
  import { uxText } from '$lib/i18n/ux';

  type State={selectedId:string;ready:boolean};
  type Account={id:string;name:string;kind:string;currency:string;balance:string;openingBalance:string;archivedAt?:string|null};
  const workspace=getContext<State>('capybudget-workspaces');
  const authUi=getContext<AuthUiState>(AUTH_UI_CONTEXT);const t=(key:Parameters<typeof trackingText>[1])=>trackingText(authUi.locale,key);
  const ux=(key:Parameters<typeof uxText>[1])=>uxText(authUi.locale,key);
  let accounts=$state<Account[]>([]),name=$state(''),kind=$state('cash'),openingBalance=$state('0'),error=$state(''),busy=$state(false),loading=$state(true);
  let reloadKey=$state(0),requestSequence=0,archiveTarget=$state<Account|null>(null),renamingId=$state(''),renameValue=$state('');
  const kinds=[['cash','kindCash'],['bank','kindBank'],['e_wallet','kindEWallet'],['credit_card','kindCard'],['savings','kindSavings'],['investment','kindInvest']] as const;
  const kindLabel=(k:string)=>t((kinds.find(([v])=>v===k)?.[1]??'kindCash') as Parameters<typeof trackingText>[1]);
  $effect(()=>{void (workspace as {revision?:number}).revision;const id=workspace.selectedId;const key=reloadKey;if(id)void load(id);});
  async function load(id:string){
    const sequence=++requestSequence;loading=true;error='';
    try{const r=await fetch('/api/workspaces/'+id+'/accounts');const j=await r.json();if(sequence!==requestSequence)return;if(!r.ok)throw new Error(j.message??t('unableAccounts'));accounts=j.items;}
    catch(e){if(sequence===requestSequence)error=e instanceof Error?e.message:t('unableAccounts');}
    finally{if(sequence===requestSequence)loading=false;}
  }
  async function create(event:SubmitEvent){
    event.preventDefault();if(busy||!workspace.selectedId)return;busy=true;error='';
    try{
      const r=await fetch('/api/workspaces/'+workspace.selectedId+'/accounts',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name,kind,openingBalance})});
      const j=await r.json();if(!r.ok)throw new Error(j.message??t('unableCreateAccount'));
      name='';openingBalance='0';reloadKey++;
    }catch(e){error=e instanceof Error?e.message:t('unableCreateAccount');}
    finally{busy=false;}
  }
  async function confirmArchive(){
    const account=archiveTarget;if(!account)return;
    try{const r=await fetch(`/api/workspaces/${workspace.selectedId}/accounts/${account.id}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({archived:true})});const j=await r.json();if(!r.ok)throw new Error(j.message??t('unableArchive'));reloadKey++;}
    catch(e){error=e instanceof Error?e.message:t('unableArchive');}
    finally{archiveTarget=null;}
  }
  function startRename(account:Account){renamingId=account.id;renameValue=account.name;}
  async function saveRename(account:Account){
    const value=renameValue.trim();if(!value||value===account.name){renamingId='';return;}
    try{const r=await fetch(`/api/workspaces/${workspace.selectedId}/accounts/${account.id}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({name:value})});const j=await r.json();if(!r.ok)throw new Error(j.message??t('unableRename'));renamingId='';reloadKey++;}
    catch(e){error=e instanceof Error?e.message:t('unableRename');}
  }
</script>
<LoadingScope active={!!busy || !!loading} />

<PageHeader eyebrow={authUi.locale==='id'?'UANG ANDA, TERATUR':'YOUR MONEY, ORGANIZED'} title={t('accountHeading')} description={t('accountIntro')} />
{#if !workspace.ready}<LoadingSkeleton rows={3} label={t('loading')} />
{:else if !workspace.selectedId}<p role="alert">{t('chooseWorkspace')}</p>
{:else}
  <div class="grid">
    <Card.Root><Card.Header><Card.Title>{t('yourAccounts')}</Card.Title><Card.Description>{t('accountDescription')}</Card.Description></Card.Header>
      <Card.Content>
        {#if loading}<LoadingSkeleton rows={3} label={t('loadingAccounts')} />
        {:else if error}<ErrorState title={ux('errorTitle')} message={error} retryLabel={ux('retry')} onRetry={()=>reloadKey++} />
        {:else if accounts.length===0}<EmptyState title={t('noAccounts')} body={t('noAccountsHint')} actionLabel={t('addAccount')} actionHref="#account-name" />
        {:else}
        <ResponsiveList label={t('yourAccounts')}>
          {#each accounts as account (account.id)}
          <li>
            <article class="account">
              <span class="account-icon" aria-hidden="true">{account.kind==='cash'?'◉':account.kind==='credit_card'?'▤':'↗'}</span>
              <div class="account-copy">
                {#if renamingId===account.id}
                  <div class="rename-row">
                    <Input value={renameValue} oninput={(e)=>renameValue=e.currentTarget.value} maxlength={100} aria-label={t('accountName')} />
                    <Button size="sm" onclick={()=>saveRename(account)}>{t('save')}</Button>
                    <Button size="sm" variant="ghost" onclick={()=>renamingId=''}>{t('cancel')}</Button>
                  </div>
                {:else}
                  <strong>{account.name}</strong>
                {/if}
                <small>{kindLabel(account.kind)} · {account.currency}</small>
              </div>
              <MoneyDisplay amount={account.balance} currency={account.currency} />
              {#if renamingId!==account.id}
              <span class="item-actions">
                <Button size="sm" variant="ghost" onclick={()=>startRename(account)}>{t('rename')}</Button>
                <Button size="sm" variant="ghost" onclick={()=>archiveTarget=account}>{t('archive')}</Button>
              </span>
              {/if}
            </article>
          </li>
          {/each}
        </ResponsiveList>
        {/if}
      </Card.Content>
    </Card.Root>
    <Card.Root><Card.Header><Card.Title>{t('addAccount')}</Card.Title><Card.Description>{t('openingHint')}</Card.Description></Card.Header>
      <Card.Content><form onsubmit={create}><Field.FieldGroup>
        <Field.Field><Field.FieldLabel for="account-name">{t('accountName')}</Field.FieldLabel><Input id="account-name" bind:value={name} maxlength={100} required placeholder={t('bankPlaceholder')} /></Field.Field>
        <Field.Field><Field.FieldLabel for="account-kind">{t('accountType')}</Field.FieldLabel><ChoiceSelect id="account-kind" bind:value={kind} items={[...(kinds).flatMap(([value,key]) => [{value: value, label: String(t(key))}])]} /></Field.Field>
        <Field.Field><Field.FieldLabel for="opening">{t('openingBalance')}</Field.FieldLabel><AmountInput id="opening" type={privacy.hidden?'password':'text'} bind:value={openingBalance} inputmode="decimal" required /></Field.Field>
        {#if error&&!loading}<p class="error" role="alert">{error}</p>{/if}
        <Button type="submit" disabled={busy}>{busy?t('saving'):t('addAccount')}</Button>
      </Field.FieldGroup></form></Card.Content>
    </Card.Root>
  </div>
  <AlertDialog.Root open={!!archiveTarget} onOpenChange={(v)=>{if(!v)archiveTarget=null;}}>
    <AlertDialog.Content>
      <AlertDialog.Header><AlertDialog.Title>{t('archiveTitle')}</AlertDialog.Title><AlertDialog.Description>{t('archiveBody')}</AlertDialog.Description></AlertDialog.Header>
      <AlertDialog.Footer><AlertDialog.Cancel onclick={()=>archiveTarget=null}>{t('cancel')}</AlertDialog.Cancel><AlertDialog.Action onclick={confirmArchive}>{t('archive')}</AlertDialog.Action></AlertDialog.Footer>
    </AlertDialog.Content>
  </AlertDialog.Root>
{/if}

<style>
  .grid{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(280px,.8fr);gap:16px;align-items:start}
  .account{display:flex;align-items:center;gap:12px}
  .account-icon{display:grid;place-items:center;width:42px;height:42px;border-radius:var(--radius-input);background:var(--pond-soft);color:var(--ring);font-size:20px;flex-shrink:0}
  .account-copy{display:grid;gap:3px;flex:1;min-width:0}
  .account-copy small{color:var(--muted-foreground)}
  .account-copy strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .rename-row{display:flex;gap:4px}
  .item-actions{display:flex;flex-shrink:0}
  .error{color:var(--destructive);font-size:13px}
  @media(max-width:850px){.grid{grid-template-columns:minmax(0,1fr)}}
  @media(max-width:600px){
    .account{display:grid;grid-template-columns:42px minmax(0,1fr);gap:12px}
    .account > :global(.money){grid-column:2;min-width:0;font-size:1rem}
    .item-actions{grid-column:1/-1;justify-content:flex-end;flex-wrap:wrap}
    .rename-row{flex-wrap:wrap}.rename-row :global(input){width:100%}
  }
</style>
