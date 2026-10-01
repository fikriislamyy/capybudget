<script lang="ts">
  import {goto} from '$app/navigation';
  import {getContext,onMount} from 'svelte';
  import {AUTH_UI_CONTEXT,type AuthUiState} from '$lib/i18n/auth';
  import {authClient} from '$lib/auth-client';
  import {Button} from '$lib/components/ui/button';
  import {Input} from '$lib/components/ui/input';
  import * as Card from '$lib/components/ui/card';
  import * as Field from '$lib/components/ui/field';
  const ui=getContext<AuthUiState>(AUTH_UI_CONTEXT);
  let mounted=$state(false);onMount(()=>{mounted=true;});
  let code=$state(''),recovery=$state(false),busy=$state(false),error=$state('');
  async function submit(e:SubmitEvent){e.preventDefault();busy=true;error='';try{
    const result=recovery?await authClient.twoFactor.verifyBackupCode({code}):await authClient.twoFactor.verifyTotp({code,trustDevice:false});
    if(result.error)throw new Error(result.error.message);code='';await goto('/dashboard',{invalidateAll:true});
  }catch{error=ui.locale==='id'?'Kode tidak valid atau kedaluwarsa.':'The code is invalid or expired.';}finally{busy=false;}}
</script>
<Card.Root><Card.Header><Card.Title>{ui.locale==='id'?'Verifikasi dua langkah':'Two-factor verification'}</Card.Title><Card.Description>{ui.locale==='id'?'Gunakan aplikasi autentikator atau kode pemulihan.':'Use your authenticator app or a recovery code.'}</Card.Description></Card.Header><Card.Content>
<form onsubmit={submit}><Field.FieldGroup><Field.Field><Field.FieldLabel for="factor-code">{recovery?(ui.locale==='id'?'Kode pemulihan':'Recovery code'):(ui.locale==='id'?'Kode autentikator':'Authenticator code')}</Field.FieldLabel><Input id="factor-code" bind:value={code} autocomplete="one-time-code" inputmode={recovery?'text':'numeric'} maxlength={32} required/></Field.Field>{#if error}<p role="alert">{error}</p>{/if}<Button type="submit" disabled={!mounted||busy}>{ui.locale==='id'?'Verifikasi':'Verify'}</Button></Field.FieldGroup></form>
</Card.Content><Card.Footer><Button variant="ghost" onclick={()=>{recovery=!recovery;code='';}}>{recovery?(ui.locale==='id'?'Gunakan autentikator':'Use authenticator'):(ui.locale==='id'?'Gunakan kode pemulihan':'Use recovery code')}</Button></Card.Footer></Card.Root>
