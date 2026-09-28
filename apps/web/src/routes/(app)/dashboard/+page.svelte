<script lang="ts">
  import { getContext } from 'svelte';
  import { Button } from '$lib/components/ui/button';
  import * as Card from '$lib/components/ui/card';
  import { AUTH_UI_CONTEXT, type AuthUiState } from '$lib/i18n/auth';
  import { trackingText } from '$lib/i18n/tracking';
  type State={selectedId:string;ready:boolean};
  type Summary={balance:string;income:string;expense:string;netChange:string};
  type Row={id:string;type:string;amount:string;currency:string;date:string;accountName:string;categoryName?:string;merchant?:string;notes?:string};
  const workspace=getContext<State>('capybudget-workspaces');
  const authUi=getContext<AuthUiState>(AUTH_UI_CONTEXT);const t=(key:Parameters<typeof trackingText>[1])=>trackingText(authUi.locale,key);
  let summary:Summary=$state({balance:'0.0000',income:'0.0000',expense:'0.0000',netChange:'0.0000'}),recent:Row[]=$state([]),loading=$state(true),error=$state(''),requestSequence=0;
  $effect(()=>{const id=workspace.selectedId;if(id)void load(id);});
  async function load(id:string){
    const sequence=++requestSequence;loading=true;error='';
    try{const [s,t]=await Promise.all([fetch('/api/workspaces/'+id+'/summary').then(r=>r.json()),fetch('/api/workspaces/'+id+'/transactions?limit=6').then(r=>r.json())]);if(sequence!==requestSequence)return;summary=s;recent=t.items;}
    catch(e){if(sequence===requestSequence)error=e instanceof Error?e.message:'Unable to load your money summary.';}
    finally{if(sequence===requestSequence)loading=false;}
  }
  function netChange(){return summary.netChange;}
</script>

<div class="welcome"><div><p class="eyebrow">A LITTLE MORE CLARITY</p><h1>{t('dashboardHeading')}</h1><p class="muted">{t('dashboardSubtitle')}</p></div><Button href="/transactions">{t('addTransaction')}</Button></div>
{#if !workspace.ready||loading}<p role="status">{t('loading')}</p>
{:else if error}<p class="error" role="alert">{error}</p>
{:else}
  <div class="stats">
    <Card.Root><Card.Header><Card.Description>{t('balance')}</Card.Description><Card.Title class="money">{summary.balance}</Card.Title></Card.Header></Card.Root>
    <Card.Root><Card.Header><Card.Description>Income</Card.Description><Card.Title class="money income">{summary.income}</Card.Title></Card.Header></Card.Root>
    <Card.Root><Card.Header><Card.Description>Expenses</Card.Description><Card.Title class="money expense">{summary.expense}</Card.Title></Card.Header></Card.Root>
    <Card.Root><Card.Header><Card.Description>{t('netChange')}</Card.Description><Card.Title class="money">{netChange()}</Card.Title></Card.Header></Card.Root>
  </div>
  <Card.Root class="history"><Card.Header><Card.Title>{t('recentTransactions')}</Card.Title><Card.Description>{t('latestActivity')}</Card.Description></Card.Header><Card.Content>
    {#if recent.length===0}<div class="empty"><span>◌</span><strong>{t('nap')}</strong><p>{t('firstTransaction')}</p><Button variant="outline" href="/transactions">{t('addTransaction')}</Button></div>
    {:else}<div class="rows">{#each recent as row (row.id)}<a class="row" href="/transactions"><span class="symbol" class:income={row.type==='income'} class:expense={row.type==='expense'}>{row.type==='income'?'↗':row.type==='expense'?'↘':'↔'}</span><span class="desc"><strong>{row.merchant||row.notes||row.type}</strong><small>{row.categoryName??row.accountName} · {row.date}</small></span><strong class="amount">{row.currency} {row.type==='expense'?'-':''}{row.amount}</strong></a>{/each}</div><div class="footer"><a href="/transactions">{t('viewHistory')}</a></div>{/if}
  </Card.Content></Card.Root>
{/if}

<style>
  .welcome{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:24px}.eyebrow{font-size:11px;letter-spacing:1px;font-weight:700;color:var(--muted-foreground);margin:0 0 6px}h1{font:500 clamp(26px,4vw,36px) 'Fredoka Variable',sans-serif;margin:0}.muted{color:var(--muted-foreground);margin:7px 0 0}.stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}:global(.money){font:500 clamp(18px,2.2vw,26px) 'Nunito Sans Variable',sans-serif;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}.income{color:#2F7A2A}.expense{color:#C7473A}:global(.history){margin-top:18px}.rows{display:grid}.row{display:grid;grid-template-columns:40px minmax(0,1fr) auto;align-items:center;gap:10px;padding:13px 2px;text-decoration:none;color:var(--foreground);border-bottom:1px solid var(--border)}.row:last-child{border:0}.symbol{display:grid;place-items:center;width:38px;height:38px;border-radius:13px;background:var(--secondary);color:var(--secondary-foreground);font-size:19px}.desc{display:grid;gap:3px}.desc small{color:var(--muted-foreground)}.amount{font-variant-numeric:tabular-nums;white-space:nowrap}.empty{text-align:center;padding:35px 8px}.empty span{font-size:32px;color:var(--muted-foreground)}.empty strong{display:block;margin-top:8px}.empty p{color:var(--muted-foreground)}.footer{text-align:right;padding:14px 0 3px}.footer a{color:var(--primary);text-decoration:none;font-weight:600}.error{color:var(--destructive)}@media(max-width:800px){.stats{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:480px){.welcome{align-items:flex-start;flex-direction:column}.stats{gap:8px}:global(.money){font-size:18px}}
</style>
