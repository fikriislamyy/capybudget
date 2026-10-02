<script lang="ts">
  import { getContext } from 'svelte';
  import { page } from '$app/state';
  import { Button } from '$lib/components/ui/button';
  import StatusScreen from '$lib/components/shared/status-screen.svelte';
  import { AUTH_UI_CONTEXT, type AuthUiState } from '$lib/i18n/auth';
  const ui = getContext<AuthUiState>(AUTH_UI_CONTEXT);
  const messages: Record<number, [string, string, string, string]> = {
    401: ['Please sign in again', 'Your session has ended. Sign in to return to your money.', 'Silakan masuk kembali', 'Sesi Anda telah berakhir. Masuk untuk kembali ke keuangan Anda.'],
    403: ['This page is private', 'Your account does not have access to this page.', 'Halaman ini bersifat pribadi', 'Akun Anda tidak memiliki akses ke halaman ini.'],
    404: ['A little off the path', 'We could not find this page. Let’s get you somewhere familiar.', 'Sedikit keluar jalur', 'Halaman ini tidak ditemukan. Mari kembali ke tempat yang familiar.'],
    408: ['That took a little too long', 'The request timed out. Give it another try when your connection is ready.', 'Memuat terlalu lama', 'Waktu permintaan habis. Coba kembali saat koneksi Anda siap.'],
    423: ['Your account is locked', 'Unlock your session to continue safely.', 'Akun Anda terkunci', 'Buka kunci sesi Anda untuk melanjutkan dengan aman.'],
    429: ['Let’s pause for a moment', 'There have been a few too many requests. Wait a little before trying again.', 'Mari jeda sebentar', 'Ada terlalu banyak permintaan. Tunggu sebentar sebelum mencoba kembali.'],
    500: ['A small bump in the pond', 'Something went wrong on our side. Please try again in a moment.', 'Ada sedikit gangguan', 'Terjadi kesalahan di sisi kami. Silakan coba kembali sebentar lagi.'],
    502: ['We could not reach the service', 'The service is having trouble responding. Please try again shortly.', 'Layanan belum dapat dihubungi', 'Layanan mengalami kendala saat merespons. Silakan coba sebentar lagi.'],
    503: ['Taking a short breather', 'The service is temporarily unavailable. Please try again shortly.', 'Sedang beristirahat sejenak', 'Layanan sementara tidak tersedia. Silakan coba sebentar lagi.'],
    504: ['The service needs another moment', 'The service took too long to respond. Please try again shortly.', 'Layanan membutuhkan waktu lagi', 'Layanan terlalu lama merespons. Silakan coba sebentar lagi.']
  };
  const copy = $derived(messages[page.status] ?? messages[500]);
  const isId = $derived(ui?.locale === 'id');
  const title = $derived(copy[isId ? 2 : 0]);
</script>
<svelte:head><title>{page.status} · {title} · CapyBudget</title><meta name="robots" content="noindex" /></svelte:head>
<StatusScreen {title} description={copy[isId ? 3 : 1]} code={page.status}>
  {#snippet actions()}
    {#if page.status === 401}<Button href="/login">{isId ? 'Masuk' : 'Sign in'}</Button>
    {:else if page.status === 423}<Button href="/unlock">{isId ? 'Buka kunci' : 'Unlock'}</Button>
    {:else if page.status >= 500 || page.status === 408 || page.status === 429}<Button onclick={() => window.location.reload()}>{isId ? 'Coba lagi' : 'Try again'}</Button>
    {:else}<Button href="/dashboard">{isId ? 'Ke dasbor' : 'Go to dashboard'}</Button>{/if}
    <Button href="/" variant="outline">{isId ? 'Ke beranda' : 'Back home'}</Button>
  {/snippet}
</StatusScreen>
