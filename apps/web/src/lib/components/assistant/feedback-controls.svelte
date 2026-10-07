<script lang="ts">
 import {getContext} from 'svelte';
 import {AUTH_UI_CONTEXT,type AuthUiState} from '$lib/i18n/auth';
 import {Button} from '$lib/components/ui/button';
 let {value=null,disabled=false,onsubmit}:{value?:string|null;disabled?:boolean;onsubmit:(action:'helpful'|'not_helpful'|'dismiss')=>Promise<void>}=$props();
 const ui=getContext<AuthUiState>(AUTH_UI_CONTEXT),L=(en:string,id:string)=>ui.locale==='id'?id:en;
 let pending=$state(false),message=$state(''),error=$state('');
 async function submit(action:'helpful'|'not_helpful'|'dismiss'){
  if(pending||disabled)return;pending=true;message='';error='';
  try{await onsubmit(action);message=action==='helpful'?L('Thanks. Your usual reminder frequency stays in place.','Terima kasih. Frekuensi pengingat pilihanmu tetap berlaku.'):action==='not_helpful'?L('Saved. Repeated negative ratings reduce optional reminders of this type.','Tersimpan. Penilaian negatif berulang mengurangi pengingat opsional jenis ini.'):L('Suggestion hidden.','Saran disembunyikan.');}
  catch(e){error=(e as Error).message||L('Could not save feedback. Try again.','Penilaian belum tersimpan. Coba lagi.');}
  finally{pending=false;}
 }
</script>
<div class="feedback-controls">
 <p>{L('Was this useful?','Apakah ini membantu?')}</p>
 <div class="feedback-actions" role="group" aria-label={L('Suggestion feedback','Penilaian saran')} aria-busy={pending}>
  <Button variant={value==='helpful'?'secondary':'outline'} aria-pressed={value==='helpful'} disabled={disabled||pending} onclick={()=>submit('helpful')}>{L('Helpful','Membantu')}{value==='helpful'?' ✓':''}</Button>
  <Button variant={value==='not_helpful'?'secondary':'outline'} aria-pressed={value==='not_helpful'} disabled={disabled||pending} onclick={()=>submit('not_helpful')}>{L('Not helpful','Kurang membantu')}{value==='not_helpful'?' ✓':''}</Button>
  <Button variant="ghost" disabled={disabled||pending} onclick={()=>submit('dismiss')}>{L('Dismiss','Abaikan')}</Button>
 </div>
 <p class="feedback-status" aria-live="polite">{pending?L('Saving feedback…','Menyimpan penilaian…'):message}</p>
 {#if error}<p class="feedback-error" role="alert">{error}</p>{/if}
</div>
<style>
 .feedback-controls{margin-top:16px;padding-top:12px;border-top:1px solid var(--border)}
 p{margin:0 0 8px;font-size:14px;color:var(--muted-foreground)}
 .feedback-actions{display:flex;flex-wrap:wrap;gap:8px}
 .feedback-actions :global([data-slot="button"]){min-height:44px;min-width:44px}
 .feedback-status{margin:8px 0 0}.feedback-status:empty{display:none}
 .feedback-error{color:var(--destructive);margin-top:8px}
</style>
