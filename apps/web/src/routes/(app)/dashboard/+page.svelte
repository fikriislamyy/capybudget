<script lang="ts">
  import { formatDate } from '$lib/dates';
  import BudgetPond from '$lib/components/shared/budget-pond.svelte';
  import SavingsPool from '$lib/components/shared/savings-pool.svelte';
  import LoadingScope from '$lib/components/shared/loading-scope.svelte';
  import ChoiceSelect from '$lib/components/forms/choice-select.svelte';
  import CapyMascot from '$lib/components/shared/capy-mascot.svelte';
  import {getContext as privacyContext} from 'svelte';
  import {concealed,PRIVACY_CONTEXT,type PrivacyState} from '$lib/privacy';
  const privacy=privacyContext<PrivacyState>(PRIVACY_CONTEXT);
  import { getContext } from 'svelte';
  import PlusIcon from '@lucide/svelte/icons/plus';
  import { Button } from '$lib/components/ui/button';
  import * as Card from '$lib/components/ui/card';
  import PageHeader from '$lib/components/shared/page-header.svelte';
  import MoneyDisplay from '$lib/components/shared/money-display.svelte';
  import LoadingSkeleton from '$lib/components/shared/loading-skeleton.svelte';
  import ErrorState from '$lib/components/shared/error-state.svelte';
  import EmptyState from '$lib/components/shared/empty-state.svelte';
  import ResponsiveList from '$lib/components/shared/responsive-list.svelte';
  import { AUTH_UI_CONTEXT, type AuthUiState } from '$lib/i18n/auth';
  import { trackingText } from '$lib/i18n/tracking';
  import { assistantText } from '$lib/i18n/assistant';
  import { uxText } from '$lib/i18n/ux';
  type State={selectedId:string;ready:boolean};
  type Summary={balance:string;income:string;expense:string;netChange:string};
  type Row={id:string;type:string;amount:string;currency:string;date:string;accountName:string;categoryName?:string;merchant?:string;notes?:string};
  type AssistantSummary={asOfDate:string;currency:string;horizonDays:number;safeToSpend:string|null;safeToSpendReason:string;minimumBalance:string;firstShortfallDate:string|null;firstLowBalanceDate:string|null;qualityFlags:string[]};
  type ReportDashboard={summary:{currency:string;income:string;expense:string};budgetActual:{name:string;planned:string;actual:string;usedPercent:number|null}[];goals:{id:string;name:string;saved:string;target:string;progressPercent:number|null}[];bills:{id:string;name:string;amount:string;dueOn:string}[]};
  const workspace=getContext<State>('capybudget-workspaces');
  const authUi=getContext<AuthUiState>(AUTH_UI_CONTEXT);const t=(key:Parameters<typeof trackingText>[1])=>trackingText(authUi.locale,key);
  const ux=(key:Parameters<typeof uxText>[1])=>uxText(authUi.locale,key);
  let summary:Summary=$state({balance:'0.0000',income:'0.0000',expense:'0.0000',netChange:'0.0000'}),recent:Row[]=$state([]),assistant:AssistantSummary|null=$state(null),assistantSuggestion:any=$state(null),reports:ReportDashboard|null=$state(null),loading=$state(true),loadedFor=$state(''),error=$state(''),requestSequence=0,horizon=$state(30);
  $effect(()=>{void (workspace as {revision?:number}).revision;const id=workspace.selectedId;if(id)void load(id);});
  async function load(id:string){
    const sequence=++requestSequence;loading=true;error='';
    try{const [s,t,a,r]=await Promise.all([fetch('/api/workspaces/'+id+'/summary').then(r=>r.json()),fetch('/api/workspaces/'+id+'/transactions?limit=6').then(r=>r.json()),fetch(`/api/workspaces/${id}/assistant/forecast?horizon=${horizon}`).then(async r=>r.ok?await r.json():null).catch(()=>null),fetch(`/api/workspaces/${id}/reports/dashboard?preset=this_month`).then(async r=>r.ok?await r.json():null).catch(()=>null)]);if(sequence!==requestSequence)return;if(!s.balance||!Array.isArray(t.items))throw new Error(authUi.locale==='id'?'Gagal memuat ringkasan.':'Unable to load your money summary.');loadedFor=id;summary=s;recent=t.items;assistant=a?.forecast??null;assistantSuggestion=a?.suggestions?.[0]??null;reports=r;}
    catch(e){if(sequence===requestSequence)error=e instanceof Error?e.message:'Unable to load your money summary.';}
    finally{if(sequence===requestSequence)loading=false;}
  }
  function retry(){if(workspace.selectedId)void load(workspace.selectedId);}
  function suggestionTitle(value:string){return assistantText(authUi.locale,value==='shortfall'?'shortfall':value==='low_balance'?'lowBalance':value==='savings'?'savingsOpportunity':'invoiceFollowup');}
  function monthDay(value:string){return formatDate(value);}
  function changeHorizon(value:string){horizon=Number(value);if(workspace.selectedId)void load(workspace.selectedId);}
</script>
<LoadingScope active={!!loading} />

<PageHeader eyebrow={authUi.locale==='id'?'SEDIKIT LEBIH JELAS':'A LITTLE MORE CLARITY'} title={t('dashboardHeading')} description={t('dashboardSubtitle')}>
  {#snippet actions()}<Button href="/transactions"><PlusIcon data-icon="inline-start" />{t('addTransaction')}</Button>{/snippet}
</PageHeader>
{#if !workspace.ready||(loading&&loadedFor!==workspace.selectedId)}<LoadingSkeleton rows={4} label={t('loading')} />
{:else if error}<ErrorState title={ux('errorTitle')} message={error} retryLabel={ux('retry')} onRetry={retry} />
{:else}
  {#if loading}<p role="status" class="muted">{authUi.locale==='id'?'Memperbarui…':'Refreshing…'}</p>{/if}
  <Card.Root class="hero">
    <Card.Content class="hero-grid">
      <div>
        <div class="balance-intro"><CapyMascot size={48} /><p class="eyebrow">{assistantText(authUi.locale,'safeToSpend')}</p></div>
        {#if assistant?.safeToSpend===null||!assistant}<p class="unavailable">{assistantText(authUi.locale,'unavailable')}</p>
        {:else}<MoneyDisplay amount={assistant.safeToSpend} currency={assistant.currency} size="xl" />{/if}
        {#if assistant}<p class="muted">{assistant.safeToSpendReason==='incomplete_data'?assistantText(authUi.locale,'excluded'):assistantText(authUi.locale,'afterReserves')}</p>
        <p class="muted small">{assistantText(authUi.locale,'asOf')} {monthDay(assistant.asOfDate)} · {assistantText(authUi.locale,'assistantDisclaimer')}</p>{/if}
      </div>
      <div>
        <p class="eyebrow">{t('balance')}</p>
        <MoneyDisplay amount={summary.balance} size="xl" />
        <div class="hero-actions">
          <label for="dashboard-horizon">{assistantText(authUi.locale,'forecast')}
            <ChoiceSelect id="dashboard-horizon" value={horizon} onValueChange={(event)=>changeHorizon(String(event))} items={[{value: 30, label: "30 " + String(assistantText(authUi.locale,'days'))}, {value: 60, label: String(60) + " " + String(assistantText(authUi.locale,'days'))}, {value: 90, label: String(90) + " " + String(assistantText(authUi.locale,'days'))}]} />
          </label>
          <Button variant="outline" href="/assistant">{assistantText(authUi.locale,'forecast')} →</Button>
        </div>
      </div>
    </Card.Content>
    {#if assistant&&(assistant.firstShortfallDate||assistant.firstLowBalanceDate)}
      <Card.Footer><p class="assistant-alert" role="status">{assistant.firstShortfallDate?assistantText(authUi.locale,'shortfallOn'):assistantText(authUi.locale,'lowOn')} {monthDay(assistant.firstShortfallDate??assistant.firstLowBalanceDate!)}</p></Card.Footer>
    {/if}
    {#if assistantSuggestion}
      <Card.Footer><p class="assistant-insight"><strong>{suggestionTitle(assistantSuggestion.kind)}</strong><span>{assistantSuggestion.facts?.date?monthDay(assistantSuggestion.facts.date):assistantSuggestion.facts?.dueDate?monthDay(assistantSuggestion.facts.dueDate):''}{assistantSuggestion.facts?.amount?` · ${assistant?.currency??''} ${concealed(assistantSuggestion.facts.amount,privacy.hidden)}`:''}</span></p></Card.Footer>
    {/if}
  </Card.Root>

  <div class="flow">
    <Card.Root><Card.Header><Card.Description>{t('income')}</Card.Description><Card.Title><MoneyDisplay amount={summary.income} type="income" size="lg" /></Card.Title></Card.Header></Card.Root>
    <Card.Root><Card.Header><Card.Description>{t('expenses')}</Card.Description><Card.Title><MoneyDisplay amount={summary.expense} type="expense" size="lg" /></Card.Title></Card.Header></Card.Root>
    <Card.Root><Card.Header><Card.Description>{t('netChange')}</Card.Description><Card.Title><MoneyDisplay amount={summary.netChange} size="lg" /></Card.Title></Card.Header></Card.Root>
  </div>

  {#if reports}
  <Card.Root class="digest">
    <Card.Header>
      <div class="report-heading">
        <div><Card.Title>{authUi.locale==='id'?'Ringkasan bulan ini':'This month at a glance'}</Card.Title>
        <Card.Description><MoneyDisplay amount={reports.summary.income} currency={reports.summary.currency} type="income" /> {authUi.locale==='id'?'pemasukan':'income'} · <MoneyDisplay amount={reports.summary.expense} currency={reports.summary.currency} type="expense" /> {authUi.locale==='id'?'pengeluaran':'expenses'}</Card.Description></div>
        <Button variant="outline" href="/reports">{authUi.locale==='id'?'Lihat laporan':'View reports'} →</Button>
      </div>
    </Card.Header>
    <Card.Content>
      <div class="report-grid">
        <div><strong>{authUi.locale==='id'?'Anggaran':'Budgets'}</strong>
          {#each reports.budgetActual.slice(0,3) as budget}<div class="pond-preview"><BudgetPond name={budget.name} usedPercent={budget.usedPercent} /><p><small><MoneyDisplay amount={budget.actual} /> / <MoneyDisplay amount={budget.planned} /></small></p></div>
          {:else}<p class="report-empty">{authUi.locale==='id'?'Belum ada anggaran aktif.':'No active budgets.'}</p>{/each}
        </div>
        <div><strong>{authUi.locale==='id'?'Tagihan mendatang':'Upcoming bills'}</strong>
          {#each reports.bills.slice(0,3) as bill}<p>{bill.name}<small>{formatDate(bill.dueOn)} · <MoneyDisplay amount={bill.amount} currency={reports.summary.currency} /></small></p>
          {:else}<p class="report-empty">{authUi.locale==='id'?'Tidak ada tagihan dalam 30 hari.':'No bills due in 30 days.'}</p>{/each}
        </div>
        <div><strong>{authUi.locale==='id'?'Target tabungan':'Savings goals'}</strong>
          {#each reports.goals.slice(0,3) as goal}<div class="pool-preview"><SavingsPool name={goal.name} percent={goal.progressPercent} /><p><small><MoneyDisplay amount={goal.saved} /> / <MoneyDisplay amount={goal.target} /></small></p></div>
          {:else}<p class="report-empty">{authUi.locale==='id'?'Belum ada target tabungan.':'No active savings goals.'}</p>{/each}
        </div>
      </div>
    </Card.Content>
  </Card.Root>
  {/if}

  <Card.Root class="history">
    <Card.Header><Card.Title>{t('recentTransactions')}</Card.Title><Card.Description>{t('latestActivity')}</Card.Description></Card.Header>
    <Card.Content>
      {#if recent.length===0}
        <EmptyState title={t('nap')} body={t('firstTransaction')} actionLabel={t('addTransaction')} actionHref="/transactions" />
      {:else}
        <ResponsiveList label={t('recentTransactions')}>
          {#each recent as row (row.id)}
          <li><a class="row" href="/transactions">
            <span class="symbol" class:income={row.type==='income'} class:expense={row.type==='expense'} aria-hidden="true">{row.type==='income'?'↗':row.type==='expense'?'↘':'↔'}</span>
            <span class="desc"><strong>{row.merchant||row.notes||row.type}</strong><small>{row.categoryName??row.accountName} · {formatDate(row.date)}</small></span>
            <MoneyDisplay amount={row.amount} currency={row.currency} type={row.type==='income'||row.type==='expense'?row.type:null} />
          </a></li>
          {/each}
        </ResponsiveList>
        <div class="footer"><a href="/transactions">{t('viewHistory')}</a></div>
      {/if}
    </Card.Content>
  </Card.Root>
{/if}

<style>
  .pond-preview,.pool-preview{margin-top:16px;min-width:0}

  .eyebrow{font-size:11px;letter-spacing:1px;font-weight:700;color:var(--muted-foreground);margin:0 0 4px}
  .muted{color:var(--muted-foreground);margin:8px 0 0}
  .muted.small{font-size:12px}
  .unavailable{font-size:20px;color:var(--muted-foreground);margin:0}
  :global(.hero){margin-bottom:24px;background:var(--card);box-shadow:var(--shadow-card)}
  .balance-intro{display:flex;align-items:center;gap:12px;margin-bottom:8px}
  :global(.hero-grid){display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:24px}
  .hero-actions{display:flex;align-items:flex-end;gap:8px;margin-top:12px;flex-wrap:wrap}
  .hero-actions label{display:grid;gap:4px;font-size:12px;font-weight:700;color:var(--muted-foreground)}
  .assistant-alert{margin:0;padding:8px;border-radius:var(--radius-input);background:var(--muted);font-size:13px;width:100%}
  .assistant-insight{display:grid;gap:3px;margin:0;font-size:13px;width:100%}
  .assistant-insight span{color:var(--muted-foreground)}
  .flow{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin-bottom:24px}
  :global(.digest){margin-bottom:24px}
  .report-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}
  .report-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
  .report-grid p{display:grid;gap:4px;margin:8px 0;font-size:13px}
  .report-grid small,.report-empty{color:var(--muted-foreground)}
  :global(.history){margin-bottom:8px}
  .row{display:grid;grid-template-columns:40px minmax(0,1fr) auto;align-items:center;gap:8px;text-decoration:none;color:var(--foreground)}
  .symbol{display:grid;place-items:center;width:38px;height:38px;border-radius:var(--radius-input);background:var(--secondary);color:var(--secondary-foreground);font-size:19px}
  .symbol.income{color:var(--income-ink);background:var(--leaf-soft)}
  .symbol.expense{color:var(--expense-ink);background:var(--coral-soft)}
  .desc{display:grid;gap:3px;min-width:0}
  .desc strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .desc small{color:var(--muted-foreground)}
  .footer{text-align:right;padding:12px 0 3px}
  .footer a{color:var(--brand-ink);text-decoration:none;font-weight:600}
  @media(max-width:1100px){:global(.hero-grid){grid-template-columns:minmax(0,1fr)}}
  @media(max-width:800px){.report-grid{grid-template-columns:1fr}.flow{gap:8px}}
  @media(max-width:480px){.flow{grid-template-columns:minmax(0,1fr)}.report-heading{align-items:flex-start;flex-direction:column}}
  .flow :global([data-slot=card]:first-child){background:var(--leaf-soft)}
  .flow :global([data-slot=card]:nth-child(2)){background:var(--coral-soft)}
  .flow :global([data-slot=card]:last-child){background:var(--pond-soft)}
</style>
