<script lang="ts">
  import {getContext} from 'svelte';
  import {AUTH_UI_CONTEXT,type AuthUiState} from '$lib/i18n/auth';
  import CapyMascot from '$lib/components/shared/capy-mascot.svelte';
  let {phase='opening'}:{phase?:'opening'|'settings'|'history'}=$props();
  const ui=getContext<AuthUiState>(AUTH_UI_CONTEXT);
  const L=(en:string,id:string)=>ui.locale==='id'?id:en;
  const step=$derived(phase==='opening'?0:phase==='settings'?1:2);
  const description=$derived(phase==='opening'?L('Opening your chat…','Menyiapkan percakapan…'):phase==='settings'?L('Checking your conversation preferences…','Memeriksa preferensi percakapanmu…'):L('Finding your saved conversation…','Menemukan percakapan tersimpanmu…'));
</script>

<div class="chat-loading" aria-busy="true">
  <div class="scene" aria-hidden="true">
    <div class="capy-float"><CapyMascot size={112} steam state="thinking"/></div>
    <div class="thought"><span></span><span></span><span></span></div>
  </div>
  <div class="loading-copy" role="status" aria-live="polite" aria-atomic="true">
    <h3>{L('Loading your conversation…','Memuat percakapanmu…')}</h3>
    <p>{description}</p>
  </div>
  <div class="steps" aria-hidden="true">
    {#each [L('Open chat','Buka chat'),L('Preferences','Preferensi'),L('Conversation','Percakapan')] as label,index}
      <div class:complete={index<step} class:current={index===step}><span class="step-dot">{index<step?'✓':''}</span><span>{label}</span></div>
    {/each}
  </div>
  <div class="preview" aria-hidden="true"><div class="placeholder user"><span></span><span></span></div><div class="placeholder capy"><span></span><span></span><span></span></div></div>
  <p class="hint">{L('Type a question, or use Voice and review the transcript before sending.','Ketik pertanyaan, atau gunakan Suara dan tinjau transkrip sebelum mengirim.')}</p>
</div>

<style>
  .chat-loading{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px;padding:32px 24px;color:var(--foreground)}
  .scene{position:relative;display:flex;justify-content:center;align-items:center;min-height:104px;width:176px;flex-shrink:0}.capy-float{animation:capy-drift 3s ease-in-out infinite}.thought{position:absolute;top:0;right:0;display:flex;gap:4px;padding:12px;border:2px solid var(--border);border-radius:var(--radius-input);background:var(--card);box-shadow:var(--shadow-card)}.thought span{width:6px;height:6px;border-radius:50%;background:var(--brand-ink);animation:thought-pulse 1.4s ease-in-out infinite}.thought span:nth-child(2){animation-delay:160ms}.thought span:nth-child(3){animation-delay:320ms}
  .loading-copy{text-align:center;display:grid;gap:8px}.loading-copy h3{font:500 20px/1.3 var(--font-heading);text-wrap:balance}.loading-copy p,.hint{color:var(--muted-foreground);font-size:14px;line-height:1.5}.steps{display:flex;gap:16px;justify-content:center;flex-wrap:wrap;font-size:12px;color:var(--muted-foreground)}.steps>div{display:flex;align-items:center;gap:4px}.step-dot{width:16px;height:16px;border:2px solid var(--border);border-radius:50%;display:grid;place-items:center;font-size:10px}.current{color:var(--brand-ink)}.current .step-dot{border-color:var(--brand-ink);animation:step-breathe 1.6s ease-in-out infinite}.complete .step-dot{border-color:var(--brand-ink);background:var(--secondary);color:var(--brand-ink)}
  .preview{width:100%;max-width:320px;display:flex;flex-direction:column;gap:12px}.placeholder{display:grid;gap:8px;border:2px solid var(--border);border-radius:var(--radius-card);padding:16px;width:80%;background:var(--card)}.placeholder.user{align-self:flex-end;background:var(--secondary);width:68%}.placeholder span{height:8px;border-radius:var(--radius-button);background:var(--border);animation:line-breathe 1.8s ease-in-out infinite}.placeholder span:last-child{width:64%}.placeholder.capy span{animation-delay:240ms}.hint{text-align:center;max-width:300px;font-size:12px}
  @keyframes capy-drift{50%{transform:translateY(-4px)}}@keyframes thought-pulse{0%,75%,100%{opacity:.4;transform:translateY(0)}35%{opacity:1;transform:translateY(-2px)}}@keyframes step-breathe{50%{opacity:.45}}@keyframes line-breathe{50%{opacity:.4}}
  @media(max-height:600px){.chat-loading{justify-content:flex-start;padding:16px;gap:16px}.preview,.hint{display:none}}
  @media(prefers-reduced-motion:reduce){.capy-float,.thought span,.current .step-dot,.placeholder span{animation:none}}
</style>
