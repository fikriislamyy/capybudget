<script lang="ts">
  import LoadingScope from '$lib/components/shared/loading-scope.svelte';
 import {getContext} from 'svelte';import {AUTH_UI_CONTEXT,type AuthUiState} from '$lib/i18n/auth';import {businessText} from '$lib/i18n/business';import {uxText} from '$lib/i18n/ux';import {Button} from '$lib/components/ui/button';import * as Card from '$lib/components/ui/card';import * as Field from '$lib/components/ui/field';import {Input} from '$lib/components/ui/input';import PageHeader from '$lib/components/shared/page-header.svelte';import ErrorState from '$lib/components/shared/error-state.svelte';import LoadingSkeleton from '$lib/components/shared/loading-skeleton.svelte';
 type Workspaces={selectedId:string;ready:boolean;items:{id:string;kind:string}[]};type Profile={legalName:string;tradingName:string;address:{street?:string;city?:string;region?:string;postalCode?:string;country?:string};contactEmail:string;phone:string;taxId:string;logoDocumentId:string|null;fiscalYearStartMonth:number;fiscalYearStartDay:number;version:number};
 const workspace=getContext<Workspaces>('capybudget-workspaces'),ui=getContext<AuthUiState>(AUTH_UI_CONTEXT),t=(key:Parameters<typeof businessText>[1])=>businessText(ui.locale,key);
 const ux=(key:Parameters<typeof uxText>[1])=>uxText(ui.locale,key);
 let profile:Profile=$state({legalName:'',tradingName:'',address:{},contactEmail:'',phone:'',taxId:'',logoDocumentId:null,fiscalYearStartMonth:1,fiscalYearStartDay:1,version:1}),loading=$state(true),saving=$state(false),error=$state(''),notice=$state('');
 async function load(){if(!workspace.selectedId)return;loading=true;error='';try{const response=await fetch('/api/workspaces/'+workspace.selectedId+'/business-profile');const data=await response.json();if(!response.ok)throw new Error(data.message??t('error'));profile={...data,address:data.address??{}};}catch(e){error=e instanceof Error?e.message:t('error');}finally{loading=false;}}
 $effect(()=>{void (workspace as {revision?:number}).revision;if(workspace.ready&&workspace.selectedId)void load();});
 async function save(event:SubmitEvent){event.preventDefault();saving=true;error='';notice='';try{const response=await fetch('/api/workspaces/'+workspace.selectedId+'/business-profile',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(profile)}),data=await response.json();if(!response.ok)throw new Error(data.message??t('error'));profile={...profile,...data};notice=t('saved');}catch(e){error=e instanceof Error?e.message:t('error');}finally{saving=false;}}
 async function upload(event:Event){const input=event.currentTarget as HTMLInputElement,file=input.files?.[0];if(!file)return;error='';notice='';const form=new FormData();form.set('file',file);try{const response=await fetch('/api/workspaces/'+workspace.selectedId+'/business-profile/logo',{method:'POST',body:form}),data=await response.json();if(!response.ok)throw new Error(data.message??t('error'));profile.logoDocumentId=data.documentId;notice=t('saved');}catch(e){error=e instanceof Error?e.message:t('error');}finally{input.value='';}}
</script>
<LoadingScope active={!!loading || !!saving} />
<svelte:head><title>CapyBudget · {t('businessSettings')}</title></svelte:head>
<PageHeader eyebrow={t('studioMode').toUpperCase()} title={t('businessSettings')} description={t('businessProfile')} />
{#if error}<ErrorState title={ux('errorTitle')} message={error} retryLabel={ux('retry')} onRetry={load} />{/if}{#if notice}<p role="status">{notice}</p>{/if}
{#if loading}<LoadingSkeleton rows={4} label={t('loading')} />{:else}<Card.Root><Card.Header><Card.Title>{t('businessProfile')}</Card.Title><Card.Description>{t('profileHint')}</Card.Description></Card.Header><Card.Content>
<form onsubmit={save}><Field.FieldGroup class="fields">
 <Field.Field><Field.FieldLabel for="legal">{t('legalName')}</Field.FieldLabel><Input id="legal" bind:value={profile.legalName} maxlength={200} required /></Field.Field>
 <Field.Field><Field.FieldLabel for="trading">{t('tradingName')}</Field.FieldLabel><Input id="trading" bind:value={profile.tradingName} maxlength={200} /></Field.Field>
 <Field.Field><Field.FieldLabel for="email">{t('email')}</Field.FieldLabel><Input id="email" type="email" bind:value={profile.contactEmail} maxlength={320} /></Field.Field>
 <Field.Field><Field.FieldLabel for="phone">{t('phone')}</Field.FieldLabel><Input id="phone" bind:value={profile.phone} maxlength={80} /></Field.Field>
 <Field.Field><Field.FieldLabel for="tax">{t('taxId')}</Field.FieldLabel><Input id="tax" bind:value={profile.taxId} maxlength={100} /></Field.Field>
 <Field.Field><Field.FieldLabel for="street">{t('street')}</Field.FieldLabel><Input id="street" bind:value={profile.address.street} maxlength={200} /></Field.Field>
 <Field.Field><Field.FieldLabel for="city">{t('city')}</Field.FieldLabel><Input id="city" bind:value={profile.address.city} maxlength={200} /></Field.Field>
 <Field.Field><Field.FieldLabel for="region">{t('region')}</Field.FieldLabel><Input id="region" bind:value={profile.address.region} maxlength={200} /></Field.Field>
 <Field.Field><Field.FieldLabel for="postal">{t('postalCode')}</Field.FieldLabel><Input id="postal" bind:value={profile.address.postalCode} maxlength={200} /></Field.Field>
 <Field.Field><Field.FieldLabel for="country">{t('country')}</Field.FieldLabel><Input id="country" bind:value={profile.address.country} maxlength={200} /></Field.Field>
 <Field.Field><Field.FieldLabel for="fiscal-month">{t('fiscalMonth')}</Field.FieldLabel><Input id="fiscal-month" type="number" min="1" max="12" bind:value={profile.fiscalYearStartMonth} /></Field.Field>
 <Field.Field><Field.FieldLabel for="fiscal-day">{t('fiscalDay')}</Field.FieldLabel><Input id="fiscal-day" type="number" min="1" max="28" bind:value={profile.fiscalYearStartDay} /></Field.Field>
</Field.FieldGroup><Button type="submit" disabled={saving}>{saving?'…':t('saveProfile')}</Button></form>
<div class="logo"><label for="business-logo">{t('logo')}</label>{#if profile.logoDocumentId}<img src={'/api/workspaces/'+workspace.selectedId+'/business-documents/'+profile.logoDocumentId+'/download'} alt={t('logo')} />{/if}<Input id="business-logo" type="file" accept="image/png,image/jpeg,image/webp" onchange={upload} /><small>{t('logoHint')}</small></div>
</Card.Content></Card.Root>{/if}
<style>:global(.fields){display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-bottom:16px}.logo{display:grid;gap:8px;margin-top:24px}.logo img{max-width:180px;max-height:100px;object-fit:contain}.logo small{color:var(--muted-foreground)}@media(max-width:640px){:global(.fields){grid-template-columns:1fr}}</style>
