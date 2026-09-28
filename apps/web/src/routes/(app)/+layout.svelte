<script lang="ts">
  import { getContext, onMount, setContext } from 'svelte';
  import { goto, invalidateAll } from '$app/navigation';
  import { authClient } from '$lib/auth-client';
  import { AUTH_UI_CONTEXT, type AuthUiState } from '$lib/i18n/auth';
  import { trackingText } from '$lib/i18n/tracking';
  import { financeText } from '$lib/i18n/finance';
  import AuthPreferences from '$lib/components/auth/auth-preferences.svelte';
  import { Button } from '$lib/components/ui/button';
  import * as Field from '$lib/components/ui/field';
  import type { LayoutData } from './$types';
  import type { Snippet } from 'svelte';

  type Workspace = { id:string; name:string; kind:'personal'|'business'; currency:string; timezone:string };
  type WorkspaceState = { items:Workspace[]; selectedId:string; ready:boolean; error:string };
  let {children,data}:{children:Snippet;data:LayoutData}=$props();
  const authUi=getContext<AuthUiState>(AUTH_UI_CONTEXT);
  const t=(key:Parameters<typeof trackingText>[1])=>trackingText(authUi.locale,key);
  const finance=(key:Parameters<typeof financeText>[1])=>financeText(authUi.locale,key);
  let workspaceState:WorkspaceState=$state({items:[],selectedId:'',ready:false,error:''});
  const activeWorkspace=$derived(workspaceState.items.find((item)=>item.id===workspaceState.selectedId));
  let showWorkspaceForm=$state(false),workspaceName=$state(''),workspaceCurrency=$state('IDR'),workspaceTimezone=$state('Asia/Jakarta'),creatingWorkspace=$state(false);
  setContext('capybudget-workspaces',workspaceState);
  let signingOut=$state(false);
  type Notice={id:string;title:string;message:string;readAt:string|null};
  let notices:Notice[]=$state([]),showNotices=$state(false);

  onMount(async()=>{
    try{
      const response=await fetch('/api/workspaces',{credentials:'same-origin'});
      if(!response.ok)throw new Error('Unable to load your workspaces.');
      workspaceState.items=(await response.json()).items;
      const saved=localStorage.getItem('capybudget-workspace');
      workspaceState.selectedId=workspaceState.items.some((w:Workspace)=>w.id===saved)?saved!:workspaceState.items[0]?.id??'';
      if(workspaceState.selectedId)localStorage.setItem('capybudget-workspace',workspaceState.selectedId);
    }catch(e){workspaceState.error=e instanceof Error?e.message:'Unable to load your workspaces.';}
    finally{workspaceState.ready=true;}
  });
  function selectWorkspace(id:string){
    workspaceState.selectedId=id;localStorage.setItem('capybudget-workspace',id);
    void invalidateAll();
  }
  async function loadNotices(){
    if(!workspaceState.selectedId)return;
    const response=await fetch(`/api/workspaces/${workspaceState.selectedId}/notifications`);
    if(response.ok)notices=(await response.json()).items;
  }
  $effect(()=>{if(workspaceState.ready&&workspaceState.selectedId)void loadNotices();});
  async function markNoticeRead(id:string){
    const response=await fetch(`/api/workspaces/${workspaceState.selectedId}/notifications/${id}/read`,{method:'PATCH'});
    if(response.ok)notices=notices.map((notice)=>notice.id===id?{...notice,readAt:new Date().toISOString()}:notice);
  }
  async function createWorkspace(event:SubmitEvent){
    event.preventDefault();if(creatingWorkspace)return;creatingWorkspace=true;workspaceState.error='';
    try{const response=await fetch('/api/workspaces',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:workspaceName,kind:'business',currency:workspaceCurrency,timezone:workspaceTimezone})});const data=await response.json();if(!response.ok)throw new Error(data.message??'Unable to create workspace.');workspaceState.items=[...workspaceState.items,data.workspace];selectWorkspace(data.workspace.id);workspaceName='';showWorkspaceForm=false;}
    catch(e){workspaceState.error=e instanceof Error?e.message:'Unable to create workspace.';}finally{creatingWorkspace=false;}
  }
  async function signOut(){
    if(signingOut)return;signingOut=true;
    try{await authClient.signOut();await invalidateAll();await goto('/login');}
    finally{signingOut=false;}
  }
</script>

<svelte:head><title>CapyBudget · {data.user.name}</title></svelte:head>
<div class="app-shell" data-mode={activeWorkspace?.kind}>
  <aside class="sidebar">
    <a class="brand" href="/dashboard"><span class="brand-mark">c</span><span>capy<span>budget</span></span></a>
    <Field.Field>
      <Field.FieldLabel for="workspace">{t('workspace')}</Field.FieldLabel>
      <select id="workspace" value={workspaceState.selectedId} onchange={(event)=>selectWorkspace(event.currentTarget.value)} disabled={!workspaceState.ready}>
        {#each workspaceState.items as item (item.id)}<option value={item.id}>{item.name} · {item.kind}</option>{/each}
      </select>
    </Field.Field>
    <button class="add-workspace" type="button" onclick={()=>showWorkspaceForm=!showWorkspaceForm}>{showWorkspaceForm?t('cancel'):t('addBusiness')}</button>
    {#if showWorkspaceForm}<form class="workspace-form" onsubmit={createWorkspace}><label for="workspace-name">Business name</label><input id="workspace-name" bind:value={workspaceName} maxlength="100" required placeholder="Studio or shop"/><label for="workspace-currency">Currency</label><input id="workspace-currency" bind:value={workspaceCurrency} maxlength="3" required/><label for="workspace-timezone">Timezone</label><input id="workspace-timezone" bind:value={workspaceTimezone} required/><Button size="sm" type="submit" disabled={creatingWorkspace}>{creatingWorkspace?'Creating…':'Create workspace'}</Button></form>{/if}
    {#if workspaceState.error}<p class="load-error" role="alert">{workspaceState.error}</p>{/if}
    <nav aria-label="Main navigation">
      <a href="/dashboard">{t('overview')}</a><a href="/transactions">{t('transactions')}</a><a href="/accounts">{t('accounts')}</a><a href="/categories">{t('categories')}</a><a href="/recurring">{t('recurring')}</a><a href="/budgets">{financeText(authUi.locale,'budgets')}</a><a href="/goals">{financeText(authUi.locale,'goals')}</a><a href="/bills">{financeText(authUi.locale,'bills')}</a>
      {#if activeWorkspace?.kind==='business'}<a href="/invoices">Invoices</a><a href="/business/settings">Business profile</a>{/if}
    </nav>
    <div class="sidebar-bottom"><span class="profile-avatar">{data.user.name.slice(0,1).toUpperCase()}</span><span class="profile-name">{data.user.name}</span><Button variant="ghost" size="sm" onclick={signOut} disabled={signingOut}>{signingOut?'…':t('signOut')}</Button></div>
  </aside>
  <main class="main-area">
    <header class="topbar"><span>{t('tagline')}</span><div class="top-actions"><div class="notice-wrap"><Button variant="outline" size="sm" onclick={()=>{showNotices=!showNotices;if(!showNotices)void loadNotices();}}>{finance('notifications')}{notices.filter((n)=>!n.readAt).length?` (${notices.filter((n)=>!n.readAt).length})`:''}</Button>{#if showNotices}<section class="notice-panel" aria-label={finance('notifications')}><h2>{finance('notifications')}</h2>{#if !notices.length}<p>{finance('noNotifications')}</p>{:else}{#each notices as notice (notice.id)}<article class:unread={!notice.readAt}><strong>{notice.title}</strong><p>{notice.message}</p>{#if !notice.readAt}<Button variant="ghost" size="sm" onclick={()=>markNoticeRead(notice.id)}>{finance('markRead')}</Button>{/if}</article>{/each}{/if}</section>{/if}</div><AuthPreferences /></div></header>
    <section class="page-content">{@render children?.()}</section>
  </main>
</div>

<style>
  .app-shell{min-height:100svh;display:grid;grid-template-columns:250px minmax(0,1fr);background:var(--background);color:var(--foreground)}
  .sidebar{position:sticky;top:0;height:100svh;padding:24px 16px;display:flex;flex-direction:column;gap:22px;background:var(--sidebar);border-right:1px solid var(--sidebar-border)}
  .brand{display:flex;align-items:center;gap:10px;text-decoration:none;color:var(--sidebar-foreground);font:600 22px 'Fredoka Variable',sans-serif}
  .brand-mark{display:grid;place-items:center;width:34px;height:34px;border-radius:11px;background:var(--sidebar-primary);color:var(--sidebar-primary-foreground);font-size:23px}
  .brand>span:last-child>span{color:#6BBF59;font-weight:400}
  nav{display:grid;gap:6px;margin-top:8px}nav a{padding:11px 12px;border-radius:12px;color:var(--sidebar-foreground);text-decoration:none}nav a:hover,nav a:focus-visible{background:var(--sidebar-accent);outline-color:var(--ring)}
  .sidebar-bottom{margin-top:auto;border-top:1px solid var(--sidebar-border);padding-top:14px;display:flex;align-items:center;gap:9px}.profile-avatar{display:grid;place-items:center;width:34px;height:34px;border-radius:50%;background:var(--secondary);color:var(--secondary-foreground);font-weight:700}.profile-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .add-workspace{border:0;background:none;color:var(--primary);text-align:left;cursor:pointer;padding:4px 0;font:inherit;font-size:13px}.workspace-form{display:grid;gap:6px;font-size:12px}.workspace-form input{min-height:36px;width:100%;border:1px solid var(--input);border-radius:var(--radius);background:var(--background);color:var(--foreground);padding:6px 8px}
  .main-area{min-width:0}.topbar{height:64px;display:flex;align-items:center;justify-content:space-between;padding:0 clamp(18px,4vw,56px);border-bottom:1px solid var(--border);background:var(--background)}.top-actions{display:flex;align-items:center;gap:12px}.notice-wrap{position:relative}.notice-panel{position:absolute;right:0;top:44px;z-index:20;width:min(360px,calc(100vw - 28px));max-height:70vh;overflow:auto;background:var(--card);color:var(--card-foreground);border:1px solid var(--border);border-radius:18px;padding:14px;box-shadow:0 12px 34px #24190e24}.notice-panel h2{font-size:16px;margin:2px 0 10px}.notice-panel article{border-top:1px solid var(--border);padding:10px 2px}.notice-panel article.unread{background:color-mix(in srgb,var(--accent) 14%,transparent)}.notice-panel article p{margin:4px 0;font-size:13px;color:var(--muted-foreground)}
  .page-content{width:min(1120px,100%);margin:auto;padding:32px clamp(16px,4vw,56px) 64px}.load-error{color:var(--destructive);font-size:13px}select{width:100%;min-height:40px;border:1px solid var(--input);border-radius:var(--radius);background:var(--background);color:var(--foreground);padding:8px 10px}
  @media(max-width:760px){.app-shell{grid-template-columns:1fr}.sidebar{height:auto;position:relative;padding:12px 16px;display:grid;grid-template-columns:1fr auto;gap:10px}.sidebar>:global([data-slot=field]){grid-column:1/-1}.sidebar nav{grid-column:1/-1;display:flex;overflow:auto;margin:0}.sidebar nav a{white-space:nowrap}.sidebar-bottom{display:none}.topbar{height:54px}.page-content{padding-top:24px}}
</style>
