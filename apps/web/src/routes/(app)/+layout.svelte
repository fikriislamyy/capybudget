<script lang="ts">
  import StatusScreen from '$lib/components/shared/status-screen.svelte';
  import LoadingScope from '$lib/components/shared/loading-scope.svelte';
  import WorkspaceSwitcher from '$lib/components/layout/workspace-switcher.svelte';
  let createBusinessOpen=$state(false),workspaceSwitcherButton=$state<HTMLButtonElement|null>(null);
  import { getContext, onMount, setContext } from "svelte";
  import CapyMascot from "$lib/components/shared/capy-mascot.svelte";
  import { goto, invalidateAll } from "$app/navigation";
  import { page } from "$app/state";
  import { authClient } from "$lib/auth-client";
  import ErrorState from "$lib/components/shared/error-state.svelte";
  import QuickAddSheet from "$lib/components/ux/quick-add-sheet.svelte";
  import MobileNav from "$lib/components/layout/mobile-nav.svelte";
  import WorkspaceCreateForm, {
    type CreatedWorkspace,
  } from "$lib/components/layout/workspace-create-form.svelte";
  import {
    NAV_GROUPS,
    isActiveRoute,
    labelFor,
  } from "$lib/components/layout/nav-config";
  import {
    applyThemeChoice,
    normalizeThemeChoice,
    persistPreferences,
    cancelThemeTransition,
  } from "$lib/theme";
  import { AUTH_UI_CONTEXT, type AuthUiState } from "$lib/i18n/auth";
  import { trackingText } from "$lib/i18n/tracking";
  import { financeText } from "$lib/i18n/finance";
  import {
    notificationTitle,
    notificationMessage,
  } from "$lib/i18n/notifications";
  import {
    readPrivacyMode,
    writePrivacyMode,
    configurePrivacyMode,
    PRIVACY_CONTEXT,
    type PrivacyState,
  } from "$lib/privacy";
  import AuthPreferences from "$lib/components/auth/auth-preferences.svelte";
  import { Button } from "$lib/components/ui/button";
  import * as Field from "$lib/components/ui/field";
  import * as Sheet from "$lib/components/ui/sheet";
  import BellIcon from "@lucide/svelte/icons/bell";
  import EyeOffIcon from "@lucide/svelte/icons/eye-off";
  import EyeIcon from "@lucide/svelte/icons/eye";
  import LockIcon from "@lucide/svelte/icons/lock";
  import LogoutIcon from "@lucide/svelte/icons/log-out";
  import type { LayoutData } from "./$types";
  import type { Snippet } from "svelte";

  type Workspace = {
    id: string;
    name: string;
    kind: "personal" | "business";
    currency: string;
    timezone: string;
  };
  type WorkspaceState = {
    revision: number;
    optionsRevision: number;
    items: Workspace[];
    selectedId: string;
    ready: boolean;
    error: string;
    refreshWorkspaces: (id?: string) => Promise<void>;
  };
  let { children, data }: { children: Snippet; data: LayoutData } = $props();
  const authUi = getContext<AuthUiState>(AUTH_UI_CONTEXT);
  const t = (key: Parameters<typeof trackingText>[1]) =>
    trackingText(authUi.locale, key);
  const finance = (key: Parameters<typeof financeText>[1]) =>
    financeText(authUi.locale, key);
  const onWizard = $derived(data.appPath === "/onboarding");
  const routeReady = $derived(
    page.url.pathname === data.appPath &&
    (!onWizard || page.route.id === "/(app)/onboarding"),
  );
  let workspaceState: WorkspaceState = $state({
    revision: 0,
    optionsRevision: 0,
    items: [],
    selectedId: "",
    ready: false,
    error: "",
    refreshWorkspaces: loadWorkspaces,
  });
  const activeWorkspace = $derived(
    workspaceState.items.find((item) => item.id === workspaceState.selectedId),
  );
  const isBusiness = $derived(activeWorkspace?.kind === "business");
  setContext("capybudget-workspaces", workspaceState);
  const privacyState: PrivacyState = $state({ hidden: true });
  setContext(PRIVACY_CONTEXT, privacyState);
  let online = $state(true);
  onMount(() => {
    const update = () => (online = navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  });
  let signingOut = $state(false),
    securityReady = $state(false),
    lockEnabled = $state(false),
    quickAddOpen = $state(false),
    securityError = $state(false);
  let appInitialized = false,
    initializePending: Promise<void> | undefined;
  async function syncPreferences() {
    try {
      const r = await fetch("/api/preferences", {
        credentials: "same-origin",
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) return;
      const prefs = await r.json();
      if (prefs.customized) {
        if (
          prefs.theme === "light" ||
          prefs.theme === "dark" ||
          prefs.theme === "system"
        ) {
          authUi.theme = normalizeThemeChoice(prefs.theme);
          authUi.dark = applyThemeChoice(authUi.theme);
        }
        if (prefs.locale === "en" || prefs.locale === "id") {
          authUi.locale = prefs.locale;
          document.documentElement.lang = prefs.locale;
          try {
            localStorage.setItem("capybudget-locale", prefs.locale);
          } catch {}
        }
        if (prefs.theme === "system") void persistPreferences(authUi.theme, authUi.locale);
      } else void persistPreferences(authUi.theme, authUi.locale);
    } catch {
      /* Local preferences stand in when sync fails. */
    }
  }
  async function checkSecurity() {
    try {
      const response = await fetch("/api/security/status", {
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) {
        securityError = true;
        securityReady = false;
        if (response.status === 401 || response.status === 403)
          await goto("/login", { invalidateAll: true });
        else if (response.status === 423)
          await goto("/unlock", { invalidateAll: true });
        return false;
      }
      const status = await response.json();
      if (
        typeof status.locked !== "boolean" ||
        typeof status.lockEnabled !== "boolean"
      )
        throw new Error("Invalid security status");
      privacyState.hidden = configurePrivacyMode(
        data.user.id,
        status.privacyDefault,
      );
      privacyMode = privacyState.hidden;
      lockEnabled = status.lockEnabled;
      if (status.locked) {
        cancelThemeTransition();
        securityReady = false;
        await goto("/unlock", { invalidateAll: true });
        return false;
      }
      securityError = false;
      securityReady = true;
      return true;
    } catch {
      securityError = true;
      if (lockEnabled) securityReady = false;
      return false;
    }
  }
  onMount(() => {
    const channel = new BroadcastChannel("capybudget-security");
    const conceal = () => {
      if (!lockEnabled) return;
      cancelThemeTransition();
      securityReady = false;
      notices = [];
      channel.postMessage("locked");
      navigator.sendBeacon("/api/security/lock");
      void fetch("/api/security/lock", { method: "POST" });
    };
    const visibility = () => {
      if (document.visibilityState === "hidden") conceal();
      else void checkSecurity();
    };
    let lastActivity = 0;
    const activity = (event: Event) => {
      if (
        !event.isTrusted ||
        !securityReady ||
        !lockEnabled ||
        Date.now() - lastActivity < 30_000
      )
        return;
      lastActivity = Date.now();
      void fetch("/api/security/activity", { method: "POST" }).catch(() => {});
    };
    document.addEventListener("pointerdown", activity);
    document.addEventListener("keydown", activity);
    channel.onmessage = (e) => {
      if (e.data === "locked") {
        securityReady = false;
        void goto("/unlock", { invalidateAll: true });
      }
      if (e.data === "logout") void goto("/login", { invalidateAll: true });
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", conceal);
    return () => {
      channel.close();
      document.removeEventListener("pointerdown", activity);
      document.removeEventListener("keydown", activity);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", conceal);
    };
  });
  type Notice = {
    id: string;
    kind: string;
    messageKey: string;
    messageParams: Record<string, unknown>;
    title: string;
    message: string;
    readAt: string | null;
  };
  let notices: Notice[] = $state([]),
    showNotices = $state(false),
    unreadCount = $state(0),
    privacyMode = $state(false);

  onMount(() => {
    const original = window.fetch;
    let active = true;
    const wrapped = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await original(input, init);
      const path = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
      const method = init?.method ?? (input instanceof Request ? input.method : "GET");
      if (active && path.includes("/api/workspaces/") && !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase()) && !path.includes("/assistant/") && !path.includes("/reports/") && !path.endsWith("/recurring-occurrences/materialize") && response.ok) {
        workspaceState.revision++;
        if (/\/(?:accounts|categories)(?:\/|$|\?)/.test(path)) workspaceState.optionsRevision++;
      }
      return response;
    }) as typeof window.fetch;
    window.fetch = wrapped;
    return () => {
      active = false;
      if (window.fetch === wrapped) window.fetch = original;
    };
  });
  async function initializeApp() {
    if (appInitialized) return;
    if (initializePending) return initializePending;
    initializePending = (async () => {
      try {
        void syncPreferences();
        await loadWorkspaces();
        appInitialized = true;
      } catch (e) {
        workspaceState.error =
          e instanceof Error ? e.message : "Unable to load your workspaces.";
      } finally {
        workspaceState.ready = true;
      }
    })();
    try {
      await initializePending;
    } finally {
      initializePending = undefined;
    }
  }
  onMount(() => {
    void checkSecurity().then((ok) => {
      if (ok) return initializeApp();
    });
  });
  async function loadWorkspaces(preferredId?: string) {
    const response = await fetch("/api/workspaces", {
      credentials: "same-origin",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok)
      throw new Error(
        authUi.locale === "id"
          ? "Tidak dapat memuat ruang kerja."
          : "Unable to load your workspaces.",
      );
    const result = await response.json();
    if (!Array.isArray(result.items))
      throw new Error("Invalid workspace response");
    workspaceState.items = result.items;
    workspaceState.error = "";
    let saved = preferredId ?? workspaceState.selectedId;
    if (!saved)
      try {
        saved =
          localStorage.getItem("capybudget-workspace:" + data.user.id) ?? "";
      } catch {}
    workspaceState.selectedId = workspaceState.items.some((w) => w.id === saved)
      ? saved
      : (workspaceState.items[0]?.id ?? "");
    try {
      if (workspaceState.selectedId)
        localStorage.setItem(
          "capybudget-workspace:" + data.user.id,
          workspaceState.selectedId,
        );
    } catch {}
  }
  function selectWorkspace(id: string) {
    if (id === workspaceState.selectedId) return;
    notices = [];
    unreadCount = 0;
    showNotices = false;
    workspaceState.selectedId = id;
    quickAddOpen = false;
    if (
      (page.url.pathname.startsWith("/invoices") ||
        page.url.pathname.startsWith("/business")) &&
      workspaceState.items.find((w) => w.id === id)?.kind !== "business"
    )
      void goto("/dashboard");
    try {
      localStorage.setItem("capybudget-workspace:" + data.user.id, id);
    } catch {}
    void invalidateAll();
  }
  function handleWorkspaceCreated(w: CreatedWorkspace) {
    workspaceState.items = [...workspaceState.items, w];
    selectWorkspace(w.id);
  }
  async function loadNotices() {
    const id = workspaceState.selectedId;
    if (!id) return;
    const [response, countResponse] = await Promise.all([
      fetch(`/api/workspaces/${id}/notifications?limit=8&state=unread`),
      fetch(`/api/workspaces/${id}/notifications/unread-count`),
    ]);
    if (id !== workspaceState.selectedId) return;
    if (response.ok) notices = (await response.json()).items;
    if (countResponse.ok)
      unreadCount = Number((await countResponse.json()).count) || 0;
  }
  onMount(() => {
    privacyMode = readPrivacyMode();
    privacyState.hidden = privacyMode;
    const updatePrivacy = () => {
      privacyMode = readPrivacyMode();
      privacyState.hidden = privacyMode;
    };
    window.addEventListener("capybudget-privacy-change", updatePrivacy);
    window.addEventListener("storage", updatePrivacy);
    return () => {
      window.removeEventListener("capybudget-privacy-change", updatePrivacy);
      window.removeEventListener("storage", updatePrivacy);
    };
  });
  onMount(() => {
    let securityPending = false,
      refreshPending = false;
    const securityBeat = async () => {
      if (document.visibilityState !== "visible" || securityPending) return;
      securityPending = true;
      try {
        if (await checkSecurity()) await initializeApp();
      } finally {
        securityPending = false;
      }
    };
    const financeBeat = async () => {
      if (
        document.visibilityState !== "visible" ||
        !navigator.onLine ||
        !securityReady ||
        refreshPending
      )
        return;
      refreshPending = true;
      try {
        await loadNotices();
        if (
          !document.activeElement?.matches("input,textarea,select") &&
          !document.querySelector('[role="dialog"]')
        ) {
          workspaceState.revision++;
          workspaceState.optionsRevision++;
        }
      } catch {
        /* A failed notification refresh must not stop future refreshes. */
      } finally {
        refreshPending = false;
      }
    };
    const securityTimer = setInterval(() => void securityBeat(), 30_000);
    const financeTimer = setInterval(() => void financeBeat(), 60_000);
    const awake = () => {
      void securityBeat().then(financeBeat);
    };
    window.addEventListener("focus", awake);
    window.addEventListener("online", awake);
    document.addEventListener("visibilitychange", awake);
    return () => {
      clearInterval(securityTimer);
      clearInterval(financeTimer);
      window.removeEventListener("focus", awake);
      window.removeEventListener("online", awake);
      document.removeEventListener("visibilitychange", awake);
    };
  });
  $effect(() => {
    if (workspaceState.ready && workspaceState.selectedId) void loadNotices();
  });
  async function markNoticeRead(id: string) {
    const response = await fetch(
      `/api/workspaces/${workspaceState.selectedId}/notifications/${id}/read`,
      { method: "PATCH" },
    );
    if (response.ok) {
      notices = notices.filter((notice) => notice.id !== id);
      unreadCount = Math.max(0, unreadCount - 1);
    }
  }
  async function lockNow() {
    cancelThemeTransition();
    securityReady = false;
    await fetch("/api/security/lock", { method: "POST" });
    await goto("/unlock", { invalidateAll: true });
  }
  async function signOut() {
    if (signingOut) return;
    signingOut = true;
    try {
      cancelThemeTransition();
      securityReady = false;
      const channel = new BroadcastChannel("capybudget-security");
      channel.postMessage("logout");
      channel.close();
      await authClient.signOut();
      await invalidateAll();
      await goto("/login");
    } finally {
      signingOut = false;
    }
  }
</script>
<LoadingScope active={!!signingOut} />
{#if securityReady && routeReady && data.onboardingCompleted && !onWizard}<WorkspaceCreateForm bind:open={createBusinessOpen} locale={authUi.locale} onCreated={handleWorkspaceCreated} onCloseFocus={()=>workspaceSwitcherButton?.focus()} />{/if}

<svelte:head><title>CapyBudget · {data.user.name}</title></svelte:head>
<a class="skip" href="#main-content"
  >{authUi.locale === "id" ? "Lewati ke konten" : "Skip to content"}</a
>
{#if securityReady && routeReady && (onWizard || data.onboardingCompleted)}
  {#if onWizard}
    <div class="wizard-shell">
      <a class="brand" href="/dashboard"
        ><span class="brand-mark"><CapyMascot size={44} /></span><span
          >Capy<span>Budget</span></span
        ></a
      >
      {#key data.appPath}<main id="main-content" tabindex="-1">{@render children?.()}</main>{/key}
    </div>
  {:else}
    <div class="app-shell" data-mode={activeWorkspace?.kind}>
      <aside class="sidebar">
        <a class="brand" href="/dashboard"
          ><span class="brand-mark"><CapyMascot size={44} /></span><span
            >Capy<span>Budget</span></span
          ></a
        >
        <nav aria-label={authUi.locale === "id" ? "Navigasi utama" : "Primary"}>
          {#each NAV_GROUPS as group (group.en)}
            {@const entries = group.entries.filter(
              (e) => !e.businessOnly || isBusiness,
            )}
            {#if entries.length}
              <section aria-label={labelFor(group, authUi.locale)}>
                <h2>{labelFor(group, authUi.locale)}</h2>
                {#each entries as entry (entry.href)}
                  {@const active = isActiveRoute(page.url.pathname, entry.href)}
                  <a
                    href={entry.href}
                    class:active
                    aria-current={active ? "page" : undefined}
                  >
                    <entry.icon aria-hidden="true" /><span
                      >{labelFor(entry, authUi.locale)}</span
                    >{#if entry.href === "/notifications" && unreadCount}<span
                        class="count">{unreadCount}</span
                      >{/if}
                  </a>
                {/each}
              </section>
            {/if}
          {/each}
        </nav>
        <div class="sidebar-bottom">
          <span class="profile-avatar"
            >{data.user.name.slice(0, 1).toUpperCase()}</span
          ><span class="profile-name">{data.user.name}</span><Button
            variant="ghost"
            size="sm"
            onclick={signOut}
            disabled={signingOut}
            ><LogoutIcon data-icon="inline-start" />{signingOut
              ? "…"
              : t("signOut")}</Button
          >
        </div>
      </aside>
      <div class="content">
        <header class="topbar">
          <a class="brandmark" href="/dashboard" aria-label="CapyBudget"
            ><CapyMascot size={38} /></a
          >
          <Field.Field class="ws-field">
            <Field.FieldLabel for="workspace-switcher" class="sr-only"
              >{t("workspace")}</Field.FieldLabel
            >
            <WorkspaceSwitcher bind:triggerRef={workspaceSwitcherButton} value={workspaceState.selectedId} items={workspaceState.items} locale={authUi.locale} disabled={!workspaceState.ready} onValueChange={selectWorkspace} onAddBusiness={()=>createBusinessOpen=true} />
          </Field.Field>
          <div class="top-actions">
            <Sheet.Root
              bind:open={showNotices}
              onOpenChange={(open) => {
                if (open) void loadNotices();
              }}
            >
              <Sheet.Trigger>
                {#snippet child({ props })}
                  <Button
                    {...props}
                    class="notice-trigger"
                    variant="outline"
                    size="icon"
                    aria-label="{finance('notifications')}{unreadCount
                      ? ` (${unreadCount})`
                      : ''}"
                  >
                    <BellIcon aria-hidden="true" />{#if unreadCount}<span
                        class="dot"
                        aria-hidden="true">{unreadCount}</span
                      >{/if}
                  </Button>
                {/snippet}
              </Sheet.Trigger>
              <Sheet.Content side="right" class="notifications-sheet">
                <Sheet.Header
                  ><Sheet.Title>{finance("notifications")}</Sheet.Title
                  ></Sheet.Header
                >
                <section
                  class="notice-list"
                  aria-label={finance("notifications")}
                >
                  {#if !notices.length}<p>{finance("noNotifications")}</p>
                  {:else}{#each notices as notice (notice.id)}
                      <article class:unread={!notice.readAt}>
                        <strong
                          >{notificationTitle(notice, authUi.locale)}</strong
                        >
                        <p>
                          {privacyMode
                            ? authUi.locale === "id"
                              ? "Detail keuangan disembunyikan."
                              : "Financial details are hidden."
                            : notificationMessage(notice, authUi.locale)}
                        </p>
                        <Button
                          variant="ghost"
                          size="sm"
                          onclick={() => markNoticeRead(notice.id)}
                          >{finance("markRead")}</Button
                        >
                      </article>
                    {/each}{/if}
                  <Button
                    href="/notifications"
                    variant="outline"
                    onclick={() => (showNotices = false)}
                    >{authUi.locale === "id"
                      ? "Lihat semua pemberitahuan"
                      : "View all notifications"}</Button
                  >
                </section>
              </Sheet.Content>
            </Sheet.Root>
            <Button
              variant="outline"
              size="sm"
              onclick={() => writePrivacyMode(!privacyState.hidden)}
              aria-pressed={privacyState.hidden}
              aria-label={authUi.locale === "id"
                ? privacyState.hidden
                  ? "Tampilkan jumlah"
                  : "Sembunyikan jumlah"
                : privacyState.hidden
                  ? "Show amounts"
                  : "Hide amounts"}
              >{#if privacyState.hidden}<EyeIcon
                  data-icon="inline-start"
                />{:else}<EyeOffIcon data-icon="inline-start" />{/if}<span
                class="btn-label"
                >{authUi.locale === "id"
                  ? privacyState.hidden
                    ? "Tampilkan"
                    : "Sembunyikan"
                  : privacyState.hidden
                    ? "Show"
                    : "Hide"}</span
              ></Button
            >
            {#if lockEnabled}<Button
                class="desktop-only"
                variant="outline"
                size="sm"
                onclick={lockNow}
                ><LockIcon data-icon="inline-start" />{authUi.locale === "id"
                  ? "Kunci"
                  : "Lock"}</Button
              >{/if}
            <span class="desktop-only"><AuthPreferences /></span>
          </div>
        </header>
        <main id="main-content" class="page-content" tabindex="-1">
          {#if !online}<p role="status" class="offline">
              {authUi.locale === "id"
                ? "Anda sedang luring. Perubahan tidak dapat disimpan."
                : "You are offline. Changes cannot be saved."}
            </p>{/if}
          {#if workspaceState.error}<ErrorState
              title={authUi.locale === "id"
                ? "Ruang kerja tidak tersedia"
                : "Workspaces unavailable"}
              message={workspaceState.error}
              retryLabel={authUi.locale === "id" ? "Coba lagi" : "Retry"}
              onRetry={() => void initializeApp()}
            />{/if}
          {#key data.appPath}{#key workspaceState.selectedId}{@render children?.()}{/key}{/key}
        </main>
      </div>
    </div>
    <MobileNav
      locale={authUi.locale}
      {isBusiness}
      {lockEnabled}
      {signingOut}
      onQuickAdd={() => (quickAddOpen = true)}
      onLock={lockNow}
      onSignOut={signOut}
    />
    {#if workspaceState.selectedId && !["/transactions", "/onboarding"].includes(page.url.pathname)}
      <Button variant="ghost"
        type="button"
        class="fab"
        onclick={() => (quickAddOpen = true)}
        aria-label={t("quickAdd")}>+</Button>
    {/if}
    <QuickAddSheet
      open={quickAddOpen}
      workspaceId={workspaceState.selectedId}
      onClose={() => (quickAddOpen = false)}
    />
  {/if}
{:else}
  <StatusScreen security checking={online && !securityError}
    title={!online ? (authUi.locale === 'id' ? 'Menunggu koneksi' : 'Waiting for a connection') : securityError ? (authUi.locale === 'id' ? 'Mari coba kembali' : 'Let’s try again') : (authUi.locale === 'id' ? 'Memeriksa keamanan…' : 'Checking security…')}
    description={!online ? (authUi.locale === 'id' ? 'Sambungkan kembali agar kami dapat memeriksa sesi Anda. Data keuangan tetap tersembunyi.' : 'Reconnect so we can check your session. Your financial data stays hidden.') : securityError ? (authUi.locale === 'id' ? 'Sesi Anda belum dapat diperiksa. Data keuangan tetap tersembunyi hingga pemeriksaan selesai.' : 'We could not check your session. Your financial data stays hidden until the check succeeds.') : (authUi.locale === 'id' ? 'Memastikan sesi Anda aman sebelum menampilkan keuangan Anda.' : 'Making sure your session is secure before showing your finances.')}>
    {#snippet actions()}
      {#if securityError || !online}<Button disabled={!online} onclick={() => { securityError = false; void checkSecurity().then((ok) => { if (ok) return initializeApp(); }); }}>{authUi.locale === 'id' ? 'Coba lagi' : 'Retry'}</Button>{/if}
      <Button href="/login" variant="outline">{authUi.locale === 'id' ? 'Kembali ke halaman masuk' : 'Back to sign in'}</Button>
    {/snippet}
  </StatusScreen>
{/if}

<style>
  .skip {
    position: absolute;
    left: -9999px;
    top: 0;
    background: var(--primary);
    color: var(--primary-foreground);
    padding: 8px 16px;
    border-radius: 0 0 12px 0;
    z-index: 100;
    font-weight: 700;
  }
  .skip:focus {
    left: 0;
  }
  .app-shell {
    min-height: 100svh;
    display: grid;
    grid-template-columns: 264px minmax(0, 1fr);
    background: var(--background);
    color: var(--foreground);
  }
  .sidebar {
    position: sticky;
    top: 0;
    height: 100svh;
    padding: 24px 16px;
    display: flex;
    flex-direction: column;
    gap: 24px;
    background: var(--sidebar);
    border-right: 2px solid var(--sidebar-border);
    overflow-y: auto;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 8px;
    text-decoration: none;
    color: var(--sidebar-foreground);
    font: 600 24px var(--font-heading);
  }
  .brand-mark {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    flex-shrink: 0;
  }
  .brand > span:last-child > span {
    font-weight: 400;
  }
  nav {
    display: grid;
    gap: 12px;
    flex: 1;
    align-content: start;
    min-height: 0;
    overflow-y: auto;
  }
  nav section {
    display: grid;
    gap: 2px;
  }
  nav h2 {
    font-size: 11px;
    letter-spacing: 0.8px;
    text-transform: uppercase;
    color: var(--muted-foreground);
    margin: 0 0 2px;
    padding: 0 12px;
  }
  nav a {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
    padding: 8px 12px;
    border-radius: var(--radius-input);
    color: var(--sidebar-foreground);
    text-decoration: none;
    font-size: 14px;
    font-weight: 600;
    border: 2px solid transparent;
  }
  nav a:hover,
  nav a:focus-visible {
    background: var(--sidebar-accent);
    outline-color: var(--ring);
  }
  nav a.active {
    background: var(--sidebar-accent);
    border-color: var(--sidebar-border);
    color: var(--brand-ink);
    box-shadow: 0 3px 8px rgb(138 95 58 / 0.04);
  }
  nav a .count {
    margin-left: auto;
    background: var(--primary);
    color: var(--primary-foreground);
    font-size: 11px;
    border-radius: 99px;
    padding: 1px 8px;
  }
  .sidebar-bottom {
    margin-top: auto;
    border-top: 1px solid var(--sidebar-border);
    padding-top: 12px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .profile-avatar {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: var(--secondary);
    color: var(--secondary-foreground);
    font-weight: 700;
    flex-shrink: 0;
  }
  .profile-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .content {
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .topbar {
    position: sticky;
    top: 0;
    z-index: var(--z-header);
    min-height: 76px;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px clamp(16px, 4vw, 32px);
    border-bottom: 1px solid var(--border);
    background: var(--background);
  }
  .brandmark {
    display: none;
    place-items: center;
    width: 44px;
    height: 44px;
    text-decoration: none;
    flex-shrink: 0;
  }
  .topbar :global(.ws-field) {
    min-width: 0;
    max-width: 300px;
    flex: 1;
  }
  .topbar :global([data-slot="select-trigger"]) {width: 100%}
  .top-actions {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  :global(.notice-trigger) {
    position: relative;
  }
  .dot {
    position: absolute;
    top: -6px;
    right: -6px;
    background: var(--primary);
    color: var(--primary-foreground);
    font-size: 10px;
    font-weight: 700;
    border-radius: 99px;
    padding: 1px 4px;
  }
  .page-content {
    width: min(1280px, 100%);
    margin: 0 auto;
    padding: 24px clamp(16px, 4vw, 32px) 64px;
  }
  .offline {
    border: 1px solid var(--border);
    border-radius: var(--radius-input);
    padding: 12px;
    background: var(--card);
  }
  .wizard-shell {
    min-height: 100svh;
    display: grid;
    gap: 8px;
    justify-items: center;
    align-content: start;
    padding: 24px 16px 64px;
    background: var(--background);
    color: var(--foreground);
  }
  .wizard-shell main { width:100%;min-width:0; }
  :global(.notifications-sheet) {
    padding: 16px;
    gap: 16px;
  }
  .notice-list {
    overflow-y: auto;
    min-height: 0;
    display: grid;
    gap: 16px;
  }
  .notice-list article {
    border-bottom: 1px solid var(--border);
    padding-bottom: 12px;
  }
  .notice-list article.unread {
    border-left: 3px solid var(--primary);
    padding-left: 12px;
  }
  .notice-list p {
    overflow-wrap: anywhere;
  }
  :global(.fab) {
    position: fixed;
    right: 22px;
    bottom: 22px;
    z-index: var(--z-fab);
    display: grid;
    place-items: center;
    width: 58px;
    height: 58px;
    border-radius: 50%;
    border: 0;
    background: var(--primary);
    color: var(--primary-foreground);
    font: 400 34px/1 var(--font-heading);
    cursor: pointer;
    box-shadow: var(--shadow-raised);
    border: 2px solid var(--capy-fur-deep);
  }
  :global(.fab):active {
    transform: scale(0.94);
  }
  :global(.sr-only) {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
  :global(.bottombar) {
    display: none;
  }
  @media (prefers-reduced-motion: no-preference) {
    :global(.fab) {
      transition: transform 150ms ease;
    }
  }
  @media (max-width: 1023px) {
    .app-shell {
      grid-template-columns: minmax(0, 1fr);
    }
    .sidebar {
      display: none;
    }
    .brandmark {
      display: grid;
    }
    .desktop-only {
      display: none;
    }
    .page-content {
      padding-bottom: calc(120px + env(safe-area-inset-bottom));
    }
    :global(.fab) {
      display: none;
    }
    :global(.bottombar) {
      display: grid;
    }
  }
  @media (max-width: 600px) {
    .topbar {
      gap: 8px;
      padding: 8px 12px;
    }
    .btn-label {
      display: none;
    }
  }
  @media (min-width: 768px) and (max-width: 1023px) {
    .topbar {
      padding-left: 76px;
    }
    .brandmark {
      display: none;
    }
    .page-content {
      padding-bottom: 40px;
    }
  }
</style>
