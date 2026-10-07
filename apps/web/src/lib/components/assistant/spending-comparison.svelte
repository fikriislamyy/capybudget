<script lang="ts">
 import {getContext} from 'svelte';
 import {AUTH_UI_CONTEXT,type AuthUiState} from '$lib/i18n/auth';
 import {PRIVACY_CONTEXT,type PrivacyState} from '$lib/privacy';
 let {items}:{items:{categoryName:string;current:string;previous:string}[]}=$props();
 const ui=getContext<AuthUiState>(AUTH_UI_CONTEXT),privacy=getContext<PrivacyState>(PRIVACY_CONTEXT);
 const units=(s:string)=>{const [whole,fraction='']=s.split('.');return BigInt(whole??'0')*10000n+BigInt((fraction+'0000').slice(0,4));};
 const maximum=$derived(items.reduce((max,i)=>[units(i.current),units(i.previous),max].reduce((a,b)=>a>b?a:b),1n));
 const width=(value:string)=>Number(units(value)*10000n/maximum)/100;
</script>
{#if !privacy.hidden&&items.length}
 <figure aria-label={ui.locale==='id'?'Perbandingan pengeluaran menurut kategori. Jumlah lengkap tersedia pada tabel di bawah.':'Category spending comparison. Exact amounts are available in the table below.'}>
 <figcaption><span><i class="current"></i>{ui.locale==='id'?'Bulan ini':'This month'}</span><span><i class="previous"></i>{ui.locale==='id'?'Bulan lalu':'Last month'}</span></figcaption>
 <div class="comparison" aria-hidden="true">{#each items as item}<div class="row"><span>{item.categoryName}</span><div class="tracks"><div class="track"><i class="current" style:width={`${width(item.current)}%`}></i></div><div class="track"><i class="previous" style:width={`${width(item.previous)}%`}></i></div></div></div>{/each}</div>
 </figure>
{/if}
<style>
 figure{margin:16px 0 24px;padding:16px;border:2px solid var(--border);border-radius:var(--radius-card,20px)}figcaption{display:flex;flex-wrap:wrap;gap:16px;margin-bottom:16px;font-size:13px}figcaption span{display:flex;gap:8px;align-items:center}figcaption i{display:block;width:12px;height:12px;border-radius:50%}.current{background:var(--berry-coral,#FF7A6B)}.previous{background:var(--capy-fur,#B98B5E)}.comparison{display:grid;gap:16px}.row{display:grid;grid-template-columns:minmax(0,120px) minmax(0,1fr);gap:16px;align-items:center;font-size:13px}.row>span{overflow-wrap:anywhere}.tracks{display:grid;gap:8px}.track{height:12px;border-radius:9999px;background:var(--muted);overflow:hidden}.track i{display:block;height:100%;border-radius:9999px;transition:width 200ms ease-out}@media(prefers-reduced-motion:reduce){.track i{transition:none}}
</style>
