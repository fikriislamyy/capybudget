<script lang="ts">
  import PasswordInput from '$lib/components/forms/password-input.svelte';
  import LoadingScope from '$lib/components/shared/loading-scope.svelte';
  import {goto} from '$app/navigation';import {getContext,onMount} from 'svelte';
  import {startAuthentication,browserSupportsWebAuthn} from '@simplewebauthn/browser';
  import {AUTH_UI_CONTEXT,type AuthUiState} from '$lib/i18n/auth';import {authClient} from '$lib/auth-client';
  import {securityRequest} from '$lib/security/request';import {Button} from '$lib/components/ui/button';import {Input} from '$lib/components/ui/input';
  import * as Card from '$lib/components/ui/card';import * as Field from '$lib/components/ui/field';
  const ui=getContext<AuthUiState>(AUTH_UI_CONTEXT);const text=(en:string,id:string)=>ui.locale==='id'?id:en;
  let mounted=$state(false);onMount(()=>{mounted=true;});
  let pin=$state(''),password=$state(''),code=$state(''),full=$state(false),busy=$state(false),error=$state(''),supported=$state(false);
  async function done(){window.dispatchEvent(new Event('capybudget-unlocked'));await goto('/dashboard',{invalidateAll:true});}
  onMount(()=>{supported=browserSupportsWebAuthn();});
  async function submit(e:SubmitEvent){e.preventDefault();busy=true;error='';try{
    if(full)await securityRequest('reauthenticate',{password,code,purpose:'unlock'});else await securityRequest('unlock/pin',{pin});
    pin='';password='';code='';await done();
  }catch(e){error=e instanceof Error?e.message:text('Unable to unlock.','Tidak dapat membuka kunci.');}finally{busy=false;}}
  async function device(){busy=true;error='';try{const options=await securityRequest('webauthn/unlock/options');const response=await startAuthentication({optionsJSON:options.options});await securityRequest('webauthn/unlock/verify',{challengeId:options.challengeId,response});await done();}catch{error=text('Device verification cancelled or unavailable. Use PIN or full authentication.','Verifikasi perangkat dibatalkan atau tidak tersedia. Gunakan PIN atau autentikasi lengkap.');}finally{busy=false;}}
</script>
<LoadingScope active={!!busy} />
<Card.Root><Card.Header><Card.Title role="heading" aria-level={1}>{text('Your app is locked','Aplikasi terkunci')}</Card.Title><Card.Description>{text('Unlock this browser to see your finances.','Buka kunci browser untuk melihat keuangan Anda.')}</Card.Description></Card.Header><Card.Content><form onsubmit={submit}><Field.FieldGroup>
{#if full}<Field.Field><Field.FieldLabel for="unlock-password">{text('Password','Kata sandi')}</Field.FieldLabel><PasswordInput id="unlock-password"  bind:value={password} autocomplete="current-password" required/></Field.Field><Field.Field><Field.FieldLabel for="unlock-code">{text('Authenticator code (if enabled)','Kode autentikator (jika aktif)')}</Field.FieldLabel><Input id="unlock-code" bind:value={code} autocomplete="one-time-code" inputmode="numeric"/></Field.Field>{:else}<Field.Field><Field.FieldLabel for="unlock-pin">PIN</Field.FieldLabel><PasswordInput id="unlock-pin"  bind:value={pin} inputmode="numeric" pattern={'[0-9]{6,8}'} minlength={6} maxlength={8} required/></Field.Field>{/if}
{#if error}<p role="alert">{error}</p>{/if}<Button type="submit" disabled={!mounted||busy}>{text('Unlock','Buka kunci')}</Button>{#if supported}<Button type="button" variant="outline" disabled={busy} onclick={device}>{text('Use device security','Gunakan keamanan perangkat')}</Button><p>{text('Your device may ask for fingerprint, face, or device PIN.','Perangkat mungkin meminta sidik jari, wajah, atau PIN perangkat.')}</p>{/if}
<Button type="button" variant="ghost" onclick={()=>full=!full}>{full?'PIN':text('Use password and second factor','Gunakan kata sandi dan faktor kedua')}</Button></Field.FieldGroup></form></Card.Content><Card.Footer><Button variant="ghost" onclick={async()=>{await authClient.signOut();await goto('/login',{invalidateAll:true});}}>{text('Sign out','Keluar')}</Button></Card.Footer></Card.Root>
