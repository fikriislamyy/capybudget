<script lang="ts">
 import {onMount,untrack,type Snippet} from 'svelte';
 import {Collapsible} from 'bits-ui';
 import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
 import {page} from '$app/state';
 import {isActiveRoute} from './nav-config';
 let {name,label,hrefs,children}:{name:string;label:string;hrefs:string[];children:Snippet}=$props();
 let open=$state(true);
 const storageKey=$derived('capybudget-nav-group:'+name);
 const containsActive=$derived(hrefs.some(href=>isActiveRoute(page.url.pathname,href)));
 onMount(()=>{try{const saved=localStorage.getItem(storageKey);if(saved!==null&&!hrefs.some(href=>isActiveRoute(page.url.pathname,href)))open=saved!=='closed';}catch{}});
 $effect(()=>{void page.url.pathname;const active=containsActive;untrack(()=>{if(active)open=true;});});
 function change(next:boolean){open=next;try{localStorage.setItem(storageKey,next?'open':'closed');}catch{}}
</script>
<section class="nav-section" aria-label={label}>
 <Collapsible.Root {open} onOpenChange={change}>
  <Collapsible.Trigger>
   {#snippet child({props})}<button {...props} type="button" class="group-trigger"><span>{label}</span><ChevronDownIcon aria-hidden="true" size={16}/></button>{/snippet}
  </Collapsible.Trigger>
  <Collapsible.Content class="group-links">{@render children()}</Collapsible.Content>
 </Collapsible.Root>
</section>
<style>
 .group-trigger{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;min-height:44px;padding:8px 12px;border:0;border-radius:var(--radius-input);background:transparent;color:var(--muted-foreground);font:600 12px var(--font-body);text-align:left;cursor:pointer}
 .group-trigger:hover{background:var(--sidebar-accent)}
 .group-trigger:focus-visible{outline:2px solid var(--ring);outline-offset:2px}
 .group-trigger :global(svg){transition:transform 150ms ease-out;flex-shrink:0}
 .group-trigger[aria-expanded=true] :global(svg){transform:rotate(180deg)}
 .nav-section :global(.group-links){display:grid;gap:2px}
 .nav-section :global(.group-links[data-state=open]){animation:nav-enter 150ms ease-out}
 @keyframes nav-enter{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
 @media(prefers-reduced-motion:reduce){.group-trigger :global(svg){transition:none}.nav-section :global(.group-links[data-state=open]){animation:none}}
</style>
