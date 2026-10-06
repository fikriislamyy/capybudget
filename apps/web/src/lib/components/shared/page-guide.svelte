<script lang="ts">
 import {getContext} from 'svelte';
 import {page} from '$app/state';
 import {AUTH_UI_CONTEXT,type AuthUiState} from '$lib/i18n/auth';
 import {pageGuideFor,guideCopy} from '$lib/guidance/page-guides';
 let {pathname}:{pathname?:string}=$props();
 const ui=getContext<AuthUiState>(AUTH_UI_CONTEXT);
 const guide=$derived(pageGuideFor(pathname??page.url.pathname));
</script>
{#if guide&&ui}
 <aside class="page-guide" aria-label={ui.locale==='id'?'Tentang halaman ini':'About this page'}>
  <h2>{ui.locale==='id'?'Tentang halaman ini':'About this page'}</h2>
  <p>{guideCopy(guide.summary,ui.locale)}</p>
  <p class="guide-note">{guideCopy(guide.note,ui.locale)}</p>
 </aside>
{/if}
<style>
 .page-guide{margin-bottom:24px;padding:16px 24px;border:2px solid var(--border);border-radius:var(--radius-card);background:var(--card);color:var(--foreground)}
 h2{font-size:14px;font-weight:600;margin:0 0 8px;color:var(--brand-ink)}
 p{margin:0;max-width:85ch;font-size:14px;line-height:1.65}
 .guide-note{margin-top:8px;color:var(--muted-foreground)}
 @media(max-width:600px){.page-guide{padding:16px}}
</style>
