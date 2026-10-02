<script lang="ts">
  import { formatDate, formatDateTime } from '$lib/dates';
  import { trackLoading } from '$lib/loading.svelte';
  import LoadingScope from '$lib/components/shared/loading-scope.svelte';
  import ChoiceSelect from '$lib/components/forms/choice-select.svelte';
  import ScrollRegion from "$lib/components/shared/scroll-region.svelte";
  import { formatExactAmount } from "$lib/ux/amount";
  import { getContext, onMount, tick } from "svelte";
  import { AUTH_UI_CONTEXT, type AuthUiState } from "$lib/i18n/auth";
  import {
    PRIVACY_CONTEXT,
    type PrivacyState,
    readPrivacyMode,
  } from "$lib/privacy";
  import * as Card from "$lib/components/ui/card";
  import { Button } from "$lib/components/ui/button";
  import PageHeader from "$lib/components/shared/page-header.svelte";
  import ErrorState from "$lib/components/shared/error-state.svelte";
  import LoadingSkeleton from "$lib/components/shared/loading-skeleton.svelte";
  type Workspace = {
    id: string;
    currency: string;
    kind: "personal" | "business";
  };
  type CashflowMapping = {
    categoryId: string;
    categoryName: string;
    activity: string | null;
    version: number | null;
  };
  type ReportRun = {
    id: string;
    reportType: string;
    preset: string;
    status: string;
    generatedAt: string;
    periodFrom: string;
    periodToExclusive: string;
    currency: string;
    rowCount: number;
    expiresAt: string;
    failureCode?: string | null;
  };
  type Dashboard = {
    summary: {
      currency: string;
      period: {
        from: string;
        through: string;
        toExclusive: string;
        preset: string;
      };
      cashBalance: string;
      trackedAccountNetBalance: string;
      income: string;
      expense: string;
      netActivity: string;
      cashflow: { opening: string; closing: string; reconciled: boolean };
      generatedAt: string;
    };
    flags: string[];
    accounts: any[];
    series: any[];
    categories: any[];
    budgetActual: any[];
    goals: any[];
    bills: any[];
    cashflowRows: any[];
  };
  const authUi = getContext<AuthUiState>(AUTH_UI_CONTEXT);
  const privacy = getContext<PrivacyState>(PRIVACY_CONTEXT);
  $effect(() => {
    privacyMode = privacy.hidden;
  });
  const workspace = getContext<{
    selectedId: string;
    ready: boolean;
    items: Workspace[];
  }>("capybudget-workspaces");
  let preset = $state("this_month"),
    data: Dashboard | undefined = $state(),
    privacyMode = $state(true),
    mappings: CashflowMapping[] = $state([]),
    runs: ReportRun[] = $state([]),
    loading = $state(false),
    error = $state(""),
    status = $state(""),
    runId = $state("");
  let incomeChart = $state<HTMLDivElement>(),
    trendChart = $state<HTMLDivElement>(),
    pieChart = $state<HTMLDivElement>(),
    cashChart = $state<HTMLDivElement>();
  let charts: any[] = [],
    chartSequence = 0,
    loadedKey = "",
    requestSequence = 0,
    activeRequest: AbortController | undefined,
    resizeObserver: ResizeObserver | undefined;
  const cssVar = (name: string, fallback: string) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() ||
    fallback;
  const label = (en: string, id: string) => (authUi.locale === "id" ? id : en);
  const presets = [
    ["this_week", "This week", "Minggu ini"],
    ["last_week", "Last week", "Minggu lalu"],
    ["this_month", "This month", "Bulan ini"],
    ["last_month", "Last month", "Bulan lalu"],
    ["year_to_date", "Year to date", "Tahun ini"],
  ];
  const money = (value: string) =>
    privacyMode
      ? "••••••"
      : `${data?.summary.currency ?? ""} ${formatExactAmount(value, authUi.locale)}`;
  async function load(id: string) {
    activeRequest?.abort();
    const controller = new AbortController(),
      sequence = ++requestSequence;
    activeRequest = controller;
    loading = true;
    error = "";
    status = "";
    runId = "";
    if (loadedKey !== id + ":" + preset) {
      data = undefined;
      mappings = [];
    }
    loadedKey = id + ":" + preset;
    try {
      const [response, mappingResponse, historyResponse] = await Promise.all([
        fetch(`/api/workspaces/${id}/reports/dashboard?preset=${preset}`, {
          signal: controller.signal,
        }),
        fetch(`/api/workspaces/${id}/reports/cashflow/mappings`, {
          signal: controller.signal,
        }),
        fetch(`/api/workspaces/${id}/reports/runs?limit=10`, {
          signal: controller.signal,
        }),
      ]);
      const result = await response.json(),
        mappingBody = await mappingResponse.json(),
        history = await historyResponse.json();
      if (sequence !== requestSequence) return;
      if (!response.ok)
        throw new Error(result.message ?? "Unable to load reports.");
      data = result;
      mappings = mappingResponse.ok ? mappingBody.items : [];
      runs = historyResponse.ok ? history.items : [];
    } catch (e) {
      if (sequence !== requestSequence || controller.signal.aborted) return;
      data = undefined;
      error = e instanceof Error ? e.message : "Unable to load reports.";
    } finally {
      if (sequence === requestSequence) loading = false;
    }
  }
  async function drawCharts() {
    const chartRun = ++chartSequence;
    charts.forEach((chart) => chart.dispose());
    charts = [];
    resizeObserver?.disconnect();
    resizeObserver = undefined;
    if (!data || typeof window === "undefined" || privacyMode) return;
    const guardData = data,
      guardId = workspace.selectedId;
    const echarts = await import("$lib/charts/echarts");
    if (
      guardData !== data ||
      guardId !== workspace.selectedId ||
      privacyMode ||
      chartRun !== chartSequence
    )
      return;
    const refs = [incomeChart, trendChart, pieChart, cashChart];
    if (refs.some((ref) => !ref)) return;
    const text = cssVar("--foreground", "#3b2a1e");
    const income = cssVar("--chart-2", "#6BBF59"),
      expense = cssVar("--chart-3", "#FF7A6B"),
      pond = cssVar("--chart-1", "#5BB8D4");
    const piePalette = [
      cssVar("--chart-3", "#FF7A6B"),
      cssVar("--chart-5", "#B98B5E"),
      pond,
      cssVar("--chart-4", "#FFC53D"),
      income,
      cssVar("--transfer", "#B98B5E"),
    ];
    const axis = {
      axisLabel: { color: text, hideOverlap: true, fontSize: 11 },
      axisLine: { lineStyle: { color: cssVar("--transfer", "#b98b5e") } },
      splitLine: { lineStyle: { color: "rgba(130,100,70,.16)" } },
    };
    const init = (el: HTMLDivElement, option: any) => {
      const chart = echarts.init(el);
      chart.setOption({
        ...option,
        textStyle: {
          fontFamily: "Nunito, Nunito Sans Variable, sans-serif",
          color: text,
        },
        tooltip: {
          backgroundColor: cssVar("--card", "#FFFDF7"),
          borderColor: cssVar("--border", "#E6D5B8"),
          borderWidth: 2,
          textStyle: {
            color: text,
            fontFamily: "Nunito, Nunito Sans Variable, sans-serif",
          },
          extraCssText:
            "border-radius:14px;box-shadow:0 8px 24px rgba(138,95,58,.1)",
          ...option.tooltip,
        },
      });
      charts.push(chart);
    };
    init(incomeChart!, {
      color: [income, expense],
      tooltip: { trigger: "axis" },
      legend: {
        type: "scroll",
        orient: "horizontal",
        left: "center",
        bottom: 8,
        width: "90%",
        itemGap: 16,
        textStyle: { color: text },
      },
      // Give the legend its own row and keep large axis values inside the plot bounds.
      grid: { left: 12, right: 16, bottom: 64, top: 24, containLabel: true },
      xAxis: {
        type: "category",
        data: data.series.map((r) => formatDate(r.date)),
        ...axis,
      },
      yAxis: { type: "value", ...axis },
      series: [
        {
          name: label("Income", "Pemasukan"),
          type: "bar",
          data: data.series.map((r) => Number(r.income)),
          itemStyle: { borderRadius: [5, 5, 0, 0] },
        },
        {
          name: label("Expense", "Pengeluaran"),
          type: "bar",
          data: data.series.map((r) => Number(r.expense)),
          itemStyle: { borderRadius: [5, 5, 0, 0] },
        },
      ],
    });
    init(trendChart!, {
      color: [pond],
      tooltip: {
        trigger: "axis",
        formatter: (items: any[]) =>
          `${items[0]?.axisValue}<br/>${money(data!.series[items[0]?.dataIndex]?.cashBalance ?? "0.0000")}`,
      },
      grid: { left: 54, right: 20, bottom: 42, top: 24 },
      xAxis: {
        type: "category",
        data: data.series.map((r) => formatDate(r.date)),
        ...axis,
      },
      yAxis: { type: "value", ...axis },
      series: [
        {
          name: label("Cash balance", "Saldo kas"),
          type: "line",
          smooth: true,
          symbol: "circle",
          data: data.series.map((r) => Number(r.cashBalance)),
          areaStyle: { opacity: 0.12 },
        },
      ],
    });
    init(pieChart!, {
      color: piePalette,
      tooltip: {
        trigger: "item",
        formatter: (item: any) =>
          `${item.name}<br/>${money(item.data?.exactAmount ?? "0.0000")} (${item.percent}%)`,
      },
      legend: {
        bottom: 0,
        textStyle: { color: text },
        type: "scroll",
        width: "88%",
      },
      series: [
        {
          type: "pie",
          radius: ["38%", "68%"],
          label: { show: false },
          labelLine: { show: false },
          avoidLabelOverlap: true,
          data: data.categories
            .filter((r) => Number(r.amount) > 0)
            .map((r) => ({
              name: r.categoryName ?? label("Uncategorized", "Tanpa kategori"),
              value: Number(r.amount),
              exactAmount: r.amount,
            })),
        },
      ],
    });
    init(cashChart!, {
      color: [pond],
      tooltip: { trigger: "axis" },
      grid: { left: 54, right: 20, bottom: 42, top: 24 },
      xAxis: {
        type: "category",
        data: data.series.map((r) => formatDate(r.date)),
        ...axis,
      },
      yAxis: { type: "value", ...axis },
      series: [
        {
          name: label("Income / expense trend", "Tren pemasukan / pengeluaran"),
          type: "bar",
          data: data.series.map((r) => Number(r.income) - Number(r.expense)),
          itemStyle: { borderRadius: [5, 5, 0, 0] },
        },
      ],
    });
    resizeObserver = new ResizeObserver(() =>
      charts.forEach((chart) => chart.resize()),
    );
    for (const ref of refs) if (ref) resizeObserver.observe(ref);
  }
  const pause = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));
  async function waitForRun(id: string) {
    for (let attempt = 0; attempt < 600; attempt++) {
      const response = await fetch(
        `/api/workspaces/${workspace.selectedId}/reports/runs/${id}`,
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          body.message ?? "Report expired or could not be loaded.",
        );
      const run = body.run as ReportRun;
      runs = runs.map((item) =>
        item.id === run.id ? { ...item, ...run } : item,
      );
      if (run.status === "ready") return run;
      if (run.status === "failed")
        throw new Error(run.failureCode ?? "Report generation failed.");
      status = label("Generating report…", "Membuat laporan…");
      await pause(500);
    }
    throw new Error(
      label(
        "Report generation timed out. Retry from report history.",
        "Pembuatan laporan melewati batas waktu. Coba lagi dari riwayat laporan.",
      ),
    );
  }
  async function startExport(id: string, format: "csv" | "xlsx" | "pdf") {
    if (!workspace.selectedId) return;
    status = label("Preparing download…", "Menyiapkan unduhan…");
    const created = await fetch(
      `/api/workspaces/${workspace.selectedId}/reports/runs/${id}/exports`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ format, idempotencyKey: crypto.randomUUID() }),
      },
    );
    const createdBody = await created.json();
    if (!created.ok)
      throw new Error(createdBody.message ?? "Unable to queue export.");
    const exportId = createdBody.export.id;
    let ready = false;
    for (let attempt = 0; attempt < 600; attempt++) {
      const response = await fetch(
          `/api/workspaces/${workspace.selectedId}/reports/exports/${exportId}`,
        ),
        body = await response.json();
      if (!response.ok) throw new Error(body.message ?? "Export expired.");
      if (body.export.status === "failed")
        throw new Error(body.export.failureCode ?? "Export failed.");
      if (body.export.status === "expired") throw new Error("Export expired.");
      if (body.export.status === "ready") {
        ready = true;
        break;
      }
      status = label("Preparing download…", "Menyiapkan unduhan…");
      await pause(500);
    }
    if (!ready)
      throw new Error(
        label(
          "Export is taking too long. You can retry from report history.",
          "Ekspor terlalu lama. Anda dapat mencoba lagi dari riwayat laporan.",
        ),
      );
    const response = await fetch(
      `/api/workspaces/${workspace.selectedId}/reports/exports/${exportId}/download`,
    );
    if (!response.ok)
      throw new Error("The report file is no longer available.");
    const blob = await response.blob(),
      url = URL.createObjectURL(blob),
      anchor = document.createElement("a");
    anchor.href = url;
    anchor.download =
      response.headers
        .get("content-disposition")
        ?.match(/filename="([^"]+)"/)?.[1] ?? `capybudget-report.${format}`;
    anchor.click();
    URL.revokeObjectURL(url);
    status = label("Report downloaded.", "Laporan diunduh.");
  }
  async function exportFile(format: "csv" | "xlsx" | "pdf") {
    if (!workspace.selectedId) return;
    const finishLoading = trackLoading();
    status = label("Preparing a report snapshot…", "Menyiapkan laporan…");
    error = "";
    try {
      if (!runId) {
        const response = await fetch(
          `/api/workspaces/${workspace.selectedId}/reports/runs`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              reportType: "analytics",
              preset,
              currency: data?.summary.currency,
              idempotencyKey: crypto.randomUUID(),
            }),
          },
        );
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.message ?? "Unable to create report.");
        runId = body.run.id;
        runs = [
          {
            ...body.run,
            reportType: "analytics",
            preset,
            status: body.run.status,
            periodFrom: data?.summary.period.from ?? "",
            periodToExclusive: data?.summary.period.toExclusive ?? "",
            currency: data?.summary.currency ?? "",
            rowCount: body.run.rowCount ?? 0,
          },
          ...runs.filter((run) => run.id !== body.run.id),
        ].slice(0, 10);
      }
      await waitForRun(runId);
      await startExport(runId, format);
    } catch (e) {
      error = e instanceof Error ? e.message : "Export failed.";
      status = "";
    } finally { finishLoading(); }
  }
  async function exportExisting(id: string, format: "csv" | "xlsx" | "pdf") {
    if (!workspace.selectedId) return;
    const finishLoading = trackLoading();
    error = "";
    try {
      await waitForRun(id);
      await startExport(id, format);
    } catch (e) {
      error = e instanceof Error ? e.message : "Export failed.";
      status = "";
    } finally { finishLoading(); }
  }
  async function saveMapping(categoryId: string, activity: string) {
    if (!workspace.selectedId) return;
    const response = await fetch(
      `/api/workspaces/${workspace.selectedId}/reports/cashflow/mappings/${categoryId}`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ activity }),
      },
    );
    if (!response.ok) {
      const body = await response.json();
      error =
        body.message ??
        label(
          "Could not update category mapping.",
          "Gagal memperbarui kategori.",
        );
      return;
    }
    mappings = mappings.map((mapping) =>
      mapping.categoryId === categoryId ? { ...mapping, activity } : mapping,
    );
    if (data) await load(workspace.selectedId);
  }
  $effect(() => {
    void (workspace as { revision?: number }).revision;
    const locale = authUi.locale,
      dark = authUi.dark,
      current = data,
      privateView = privacyMode;
    void locale;
    void dark;
    void privateView;
    if (current) void tick().then(drawCharts);
  });
  $effect(() => {
    void (workspace as { revision?: number }).revision;
    const id = workspace.selectedId,
      period = preset;
    if (workspace.ready && id) void load(id);
    return () => {
      activeRequest?.abort();
      charts.forEach((chart) => chart.dispose());
      charts = [];
      resizeObserver?.disconnect();
      resizeObserver = undefined;
    };
  });
  onMount(() => {
    privacyMode = readPrivacyMode();
    return () => {
      charts.forEach((chart) => chart.dispose());
      resizeObserver?.disconnect();
    };
  });
</script>
<LoadingScope active={!!loading} />

<svelte:head
  ><title
    >{label("Reports and analytics", "Laporan dan analitik")} · CapyBudget</title
  ></svelte:head
>
<PageHeader
  eyebrow={label("A CLEAR VIEW OF YOUR MONEY", "RINGKASAN KEUANGAN ANDA")}
  title={label("Reports and analytics", "Laporan dan analitik")}
  description={label(
    "Recorded activity by workspace period. Forecasts are shown separately.",
    "Aktivitas tercatat untuk periode workspace. Proyeksi ditampilkan terpisah.",
  )}
>
  {#snippet actions()}<div class="controls">
      <label for="period"
        >{label("Period", "Periode")}<ChoiceSelect id="period" bind:value={preset} onValueChange={() => {
            if (workspace.selectedId) void load(workspace.selectedId);
          }} items={[...(presets).flatMap((item) => [{value: item[0], label: String(label(item[1], item[2]))}])]} /></label
      >
      <div class="exports">
        <Button variant="outline" onclick={() => void exportFile("csv")}
          >CSV</Button
        ><Button variant="outline" onclick={() => void exportFile("xlsx")}
          >Excel</Button
        ><Button variant="outline" onclick={() => void exportFile("pdf")}
          >PDF</Button
        >
      </div>
    </div>{/snippet}
</PageHeader>
{#if loading && !data}<LoadingSkeleton
    rows={5}
    label={label("Loading report…", "Memuat laporan…")}
  />{:else if error && !data}<ErrorState
    title={label("Something went wrong", "Terjadi kesalahan")}
    message={error}
    retryLabel={label("Retry", "Coba lagi")}
    onRetry={() => {
      if (workspace.selectedId) void load(workspace.selectedId);
    }}
  />{:else if data}
  {#if loading}<p role="status">{label("Refreshing…", "Memperbarui…")}</p>{/if}
  <p class="period">
    {formatDate(data.summary.period.from)} – {formatDate(data.summary.period.through)} · {data.summary
      .currency} · {label("Generated", "Dibuat")}
    {formatDateTime(data.summary.generatedAt, authUi.locale === "id" ? "id-ID" : "en")}
  </p>
  {#if status}<p role="status">{status}</p>{/if}{#if privacyMode}<p
      class="flags"
      role="status"
    >
      {label(
        "Amounts and charts are hidden on this screen. Downloaded reports still contain financial data.",
        "Jumlah dan grafik disembunyikan di layar ini. File yang diunduh tetap berisi data keuangan.",
      )}
    </p>{/if}{#if data.flags.length}<aside
      class="flags"
      aria-label={label("Coverage notes", "Catatan cakupan")}
    >
      {#each data.flags as flag}<p>{flag.replaceAll("_", " ")}</p>{/each}
    </aside>{/if}
  <section class="metrics" aria-label={label("Summary", "Ringkasan")}>
    <Card.Root
      ><Card.Header
        ><Card.Description
          >{label("Cash balance", "Saldo kas")}</Card.Description
        ><Card.Title>{money(data.summary.cashBalance)}</Card.Title></Card.Header
      ></Card.Root
    >
    <Card.Root
      ><Card.Header
        ><Card.Description>{label("Income", "Pemasukan")}</Card.Description
        ><Card.Title class="income">{money(data.summary.income)}</Card.Title
        ></Card.Header
      ></Card.Root
    >
    <Card.Root
      ><Card.Header
        ><Card.Description>{label("Expenses", "Pengeluaran")}</Card.Description
        ><Card.Title class="expense">{money(data.summary.expense)}</Card.Title
        ></Card.Header
      ></Card.Root
    >
    <Card.Root
      ><Card.Header
        ><Card.Description
          >{label("Net activity", "Aktivitas bersih")}</Card.Description
        ><Card.Title>{money(data.summary.netActivity)}</Card.Title></Card.Header
      ></Card.Root
    >
  </section>
  <section class="grid">
    <Card.Root
      ><Card.Header
        ><Card.Title
          >{label(
            "Income and expenses",
            "Pemasukan dan pengeluaran",
          )}</Card.Title
        ></Card.Header
      ><Card.Content
        ><div
          class="chart"
          role="img"
          aria-label={label(
            "Grouped daily income and expense bars. Exact values are in the daily report table.",
            "Grafik batang pemasukan dan pengeluaran harian. Nilai tepat tersedia pada tabel harian.",
          )}
          bind:this={incomeChart}
        ></div></Card.Content
      ></Card.Root
    >
    <Card.Root
      ><Card.Header
        ><Card.Title>{label("Daily trend", "Tren harian")}</Card.Title
        ></Card.Header
      ><Card.Content
        ><div
          class="chart"
          role="img"
          aria-label={label(
            "Daily balance trend. Exact values are in the daily report table.",
            "Tren saldo harian. Nilai tepat tersedia pada tabel harian.",
          )}
          bind:this={trendChart}
        ></div></Card.Content
      ></Card.Root
    >
    <Card.Root
      ><Card.Header
        ><Card.Title
          >{label(
            "Spending by category",
            "Pengeluaran per kategori",
          )}</Card.Title
        ></Card.Header
      ><Card.Content
        ><div
          class="chart"
          role="img"
          aria-label={label(
            "Expense share by category. Exact values are in the category table.",
            "Proporsi pengeluaran per kategori. Nilai tepat tersedia pada tabel kategori.",
          )}
          bind:this={pieChart}
        ></div></Card.Content
      ></Card.Root
    >
    <Card.Root
      ><Card.Header
        ><Card.Title
          >{label("Net change trend", "Tren perubahan bersih")}</Card.Title
        ></Card.Header
      ><Card.Content
        ><div
          class="chart"
          role="img"
          aria-label={label(
            "Daily net income and expense trend. Exact values are in the daily report table.",
            "Tren harian bersih pemasukan dan pengeluaran. Nilai tepat tersedia pada tabel harian.",
          )}
          bind:this={cashChart}
        ></div></Card.Content
      ></Card.Root
    >
  </section>
  <Card.Root class="table-card"
    ><Card.Header
      ><Card.Title
        >{label("Spending by category", "Pengeluaran per kategori")}</Card.Title
      ><Card.Description
        >{label(
          "Exact expense amounts; negative values are excluded from the pie share.",
          "Jumlah pengeluaran; nilai negatif tidak dihitung dalam proporsi diagram.",
        )}</Card.Description
      ></Card.Header
    ><Card.Content
      ><ScrollRegion
        label={label("Spending by category", "Pengeluaran per kategori")}
        ><table>
          <thead
            ><tr
              ><th>{label("Category", "Kategori")}</th><th
                >{label("Transactions", "Transaksi")}</th
              ><th>{label("Amount", "Jumlah")}</th></tr
            ></thead
          ><tbody
            >{#each data.categories as category}<tr
                ><td
                  >{category.categoryName ??
                    label("Uncategorized", "Tanpa kategori")}</td
                ><td>{category.count}</td><td>{money(category.amount)}</td></tr
              >{:else}<tr
                ><td colspan="3"
                  >{label(
                    "No expenses in this period.",
                    "Tidak ada pengeluaran pada periode ini.",
                  )}</td
                ></tr
              >{/each}</tbody
          >
        </table></ScrollRegion
      ></Card.Content
    ></Card.Root
  >
  <Card.Root class="statement"
    ><Card.Header
      ><Card.Title>{label("Cashflow statement", "Laporan arus kas")}</Card.Title
      ><Card.Description
        >{label(
          "Recorded cash movements; unclassified items stay visible.",
          "Pergerakan kas tercatat; transaksi belum terklasifikasi tetap ditampilkan.",
        )}</Card.Description
      ></Card.Header
    ><Card.Content
      ><p>
        {label("Opening cash", "Saldo awal")}
        <strong>{money(data.summary.cashflow.opening)}</strong>
        → {label("Closing cash", "Saldo akhir")}
        <strong>{money(data.summary.cashflow.closing)}</strong>
        · {data.summary.cashflow.reconciled
          ? label("Reconciled", "Seimbang")
          : label("Needs review", "Perlu ditinjau")}
      </p>
      <ScrollRegion label={label("Cashflow statement", "Laporan arus kas")}
        ><table>
          <caption
            >{label(
              "Cash movements by journal entry",
              "Pergerakan kas dari jurnal",
            )}</caption
          ><thead
            ><tr
              ><th>{label("Date", "Tanggal")}</th><th
                >{label("Activity", "Aktivitas")}</th
              ><th>{label("Category", "Kategori")}</th><th
                >{label("Amount", "Jumlah")}</th
              ></tr
            ></thead
          ><tbody
            >{#each data.cashflowRows as row}<tr
                ><td>{formatDate(row.date)}</td><td>{row.activity.replaceAll("_", " ")}</td
                ><td>{row.categoryName ?? row.reason}</td><td
                  >{money(row.amount)}</td
                ></tr
              >{:else}<tr
                ><td colspan="4"
                  >{label(
                    "No cash movements in this period.",
                    "Tidak ada pergerakan kas pada periode ini.",
                  )}</td
                ></tr
              >{/each}</tbody
          >
        </table></ScrollRegion
      >
      <h3>
        {label("Classify cashflow categories", "Klasifikasikan arus kas")}
      </h3>
      <p class="mapping-help">
        {label(
          "Choose the statement section for each category.",
          "Pilih bagian laporan arus kas untuk setiap kategori.",
        )}
      </p>
      {#each mappings as mapping}<label class="mapping-row"
          >{mapping.categoryName}<ChoiceSelect value={mapping.activity ?? "unclassified"} onValueChange={(event) =>
              void saveMapping(mapping.categoryId, event)} items={[{value: "unclassified", label: String(label("Unclassified", "Belum diklasifikasikan"))}, {value: "operating", label: String(label("Operating", "Operasi"))}, {value: "investing", label: String(label("Investing", "Investasi"))}, {value: "financing", label: String(label("Financing", "Pendanaan"))}]} /></label
        >{/each}</Card.Content
    ></Card.Root
  >
  <section class="grid lower">
    <Card.Root
      ><Card.Header
        ><Card.Title
          >{label("Budget vs actual", "Anggaran vs aktual")}</Card.Title
        ></Card.Header
      ><Card.Content
        ><ScrollRegion
          label={label("Budget versus actual", "Anggaran dan realisasi")}
          ><table>
            <thead
              ><tr
                ><th>{label("Budget", "Anggaran")}</th><th
                  >{label("Planned", "Rencana")}</th
                ><th>{label("Actual", "Aktual")}</th><th
                  >{label("Remaining", "Sisa")}</th
                ></tr
              ></thead
            ><tbody
              >{#each data.budgetActual as row}<tr
                  ><td>{row.name} · {row.categoryName}</td><td
                    >{money(row.planned)}</td
                  ><td>{money(row.actual)}</td><td>{money(row.remaining)}</td
                  ></tr
                >{:else}<tr
                  ><td colspan="4"
                    >{label(
                      "No budgets cover this period.",
                      "Tidak ada anggaran untuk periode ini.",
                    )}</td
                  ></tr
                >{/each}</tbody
            >
          </table></ScrollRegion
        ></Card.Content
      ></Card.Root
    >
    <Card.Root
      ><Card.Header
        ><Card.Title>{label("Upcoming bills", "Tagihan mendatang")}</Card.Title
        ></Card.Header
      ><Card.Content
        >{#each data.bills as bill}<p class="list-row">
            <span
              >{bill.name} · {formatDate(bill.dueOn)}{#if bill.overdue}<small>
                  · {label("Overdue", "Terlambat")}</small
                >{/if}</span
            ><strong>{money(bill.amount)}</strong>
          </p>{:else}<p>
            {label(
              "No unpaid bills in the next 30 days.",
              "Tidak ada tagihan dalam 30 hari ke depan.",
            )}
          </p>{/each}</Card.Content
      ></Card.Root
    >
    <Card.Root
      ><Card.Header
        ><Card.Title>{label("Savings goals", "Target tabungan")}</Card.Title
        ></Card.Header
      ><Card.Content
        >{#each data.goals as goal}<p class="list-row">
            <span
              >{goal.name} · {goal.progressPercent === null
                ? "—"
                : `${goal.progressPercent}%`}</span
            ><strong>{money(goal.saved)} / {money(goal.target)}</strong>
          </p>{:else}<p>
            {label(
              "No active savings goals.",
              "Tidak ada target tabungan aktif.",
            )}
          </p>{/each}</Card.Content
      ></Card.Root
    >
  </section>
  <Card.Root class="table-card mb-5"
    ><Card.Header
      ><Card.Title
        >{label(
          "Recent report snapshots",
          "Snapshot laporan terbaru",
        )}</Card.Title
      ><Card.Description
        >{label(
          "Private snapshots are available for seven days.",
          "Snapshot pribadi tersedia selama tujuh hari.",
        )}</Card.Description
      ></Card.Header
    ><Card.Content
      >{#each runs as run (run.id)}<div class="history-row">
          <span
            ><strong
              >{run.reportType.replaceAll("_", " ")} · {run.preset.replaceAll(
                "_",
                " ",
              )} · {run.status}</strong
            ><small
              >{formatDateTime(run.generatedAt, authUi.locale === "id" ? "id-ID" : "en")} · {run.currency} · {run.rowCount}
              {label("rows", "baris")}{run.failureCode
                ? ` · ${run.failureCode}`
                : ""}</small
            ></span
          >
          <div class="exports">
            <Button
              size="sm"
              variant="outline"
              onclick={() => void exportExisting(run.id, "csv")}>CSV</Button
            ><Button
              size="sm"
              variant="outline"
              onclick={() => void exportExisting(run.id, "xlsx")}>Excel</Button
            ><Button
              size="sm"
              variant="outline"
              onclick={() => void exportExisting(run.id, "pdf")}>PDF</Button
            >
          </div>
        </div>{:else}<p>
          {label(
            "No saved report snapshots yet. Use an export button to create one.",
            "Belum ada snapshot laporan. Gunakan tombol ekspor untuk membuat snapshot.",
          )}
        </p>{/each}</Card.Content
    ></Card.Root
  >
  <Card.Root class="table-card"
    ><Card.Header
      ><Card.Title
        >{label(
          "Income and expense by day",
          "Pemasukan dan pengeluaran per hari",
        )}</Card.Title
      ></Card.Header
    ><Card.Content
      ><ScrollRegion label={label("Daily report", "Laporan harian")}
        ><table>
          <caption
            >{label(
              "Exact amounts shown as recorded",
              "Jumlah sesuai pencatatan",
            )}</caption
          ><thead
            ><tr
              ><th>{label("Date", "Tanggal")}</th><th
                >{label("Income", "Pemasukan")}</th
              ><th>{label("Expenses", "Pengeluaran")}</th><th
                >{label("Net", "Bersih")}</th
              ><th>{label("Cash balance", "Saldo kas")}</th></tr
            ></thead
          ><tbody
            >{#each data.series as row}<tr
                ><td>{formatDate(row.date)}</td><td>{money(row.income)}</td><td
                  >{money(row.expense)}</td
                ><td>{money(row.net)}</td><td>{money(row.cashBalance)}</td></tr
              >{/each}</tbody
          >
        </table></ScrollRegion
      ></Card.Content
    ></Card.Root
  >
{:else if !loading}<p>
    {label(
      "Choose a workspace to view reports.",
      "Pilih workspace untuk melihat laporan.",
    )}
  </p>{/if}

<style>
  .period {
    color: var(--muted-foreground);
    font-size: 13px;
  }
  .controls {
    display: flex;
    align-items: end;
    gap: 8px;
    flex-wrap: wrap;
  }
  .controls label {
    display: grid;
    gap: 4px;
    font-size: 12px;
  }
  .exports {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    align-items: end;
  }
  .metrics {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 16px;
    margin: 24px 0;
  }
  .metrics :global([data-slot="card-title"]) {
    font-size: clamp(17px, 2vw, 24px);
    overflow-wrap: anywhere;
    font-variant-numeric: tabular-nums;
  }
  :global(.income) {
    color: var(--income-ink);
  }
  :global(.expense) {
    color: var(--expense-ink);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 24px;
    margin: 24px 0;
  }
  :global(.table-card + .statement) {
    margin-block-start: 24px;
  }
  .chart {
    width: 100%;
    height: clamp(220px, 52vw, 300px);
  }
  .lower {
    margin-top: 12px;
  }
  .period {
    margin: 8px 0;
  }
  .flags {
    padding: 8px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-input);
    background: var(--muted);
  }
  .flags p {
    margin: 3px 0;
    text-transform: capitalize;
    font-size: 12px;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    font-size: 13px;
  }
  caption {
    text-align: left;
    padding: 8px;
    font-weight: 600;
  }
  th,
  td {
    text-align: left;
    padding: 8px;
    border-bottom: 1px solid var(--border);
    font-variant-numeric: tabular-nums;
  }
  td:nth-last-child(-n + 3):not(:first-child),
  th:nth-last-child(-n + 3):not(:first-child) {
    text-align: right;
  }
  .list-row {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    border-bottom: 1px solid var(--border);
    padding: 8px 0;
    font-size: 12px;
  }
  .list-row strong {
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .list-row small {
    color: var(--destructive);
  }
  .mapping-help {
    color: var(--muted-foreground);
    font-size: 13px;
  }
  .mapping-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding: 8px 0;
    border-bottom: 1px solid var(--border);
    font-size: 13px;
  }
  .history-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding: 8px 0;
    border-bottom: 1px solid var(--border);
  }
  .history-row span {
    display: grid;
    gap: 4px;
  }
  .history-row small {
    color: var(--muted-foreground);
  }
  @media (max-width: 850px) {
    .controls {
      align-items: end;
      justify-content: space-between;
    }
    .metrics {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .grid {
      grid-template-columns: 1fr;
    }
  }
  @media (max-width: 480px) {
    .controls {
      align-items: stretch;
      flex-direction: column;
    }
    .metrics {
      gap: 8px;
    }
    .metrics :global([data-slot="card"]:first-child),
    .metrics :global([data-slot="card"]:last-child) {
      grid-column: 1/-1;
    }
  }
  .metrics :global([data-slot="card"]:first-child) {
    background: var(--secondary);
  }
  .metrics :global([data-slot="card"]:nth-child(2)) {
    background: var(--leaf-soft);
  }
  .metrics :global([data-slot="card"]:nth-child(3)) {
    background: var(--coral-soft);
  }
  .metrics :global([data-slot="card-title"]) {
    font-family: var(--font-body);
    font-weight: 800;
  }
  .metrics :global([data-slot="card"]:first-child [data-slot="card-title"]) {
    font-size: clamp(16px, 1.2vw, 20px);
  }
  @media (min-width: 851px) and (max-width: 1250px) {
    .metrics {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
