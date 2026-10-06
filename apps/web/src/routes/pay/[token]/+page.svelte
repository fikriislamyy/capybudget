<script lang="ts">
 import {getContext,onMount,untrack} from 'svelte';
 import {AUTH_UI_CONTEXT,type AuthUiState} from '$lib/i18n/auth';
 import {Button} from '$lib/components/ui/button';
 import * as Card from '$lib/components/ui/card';
 import CapyMascot from '$lib/components/shared/capy-mascot.svelte';
 import {formatDateTime} from '$lib/dates';
 import QRCode from 'qrcode';
 import type {PageData} from './$types';
 let {data}:{data:PageData}=$props();
 const ui=getContext<AuthUiState>(AUTH_UI_CONTEXT),copy=(en:string,id:string)=>ui.locale==='id'?id:en;
 let payment=$state(untrack(()=>data.payment)),qr=$state(''),error=$state(''),checking=$state(false),simulating=$state(false),simulationMessage=$state(''),now=$state(Date.now());
 const expired=$derived(payment.expiresAt&&Date.parse(payment.expiresAt)<=now);
 const pending=$derived(payment.state==='pending'&&!expired);
 const money=(value:string|null)=>new Intl.NumberFormat(ui.locale==='id'?'id-ID':'en-US',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(value??0));
 $effect(()=>{payment=data.payment;});
 $effect(()=>{const value=pending?payment.qrString:null;let cancelled=false;qr='';if(value)void QRCode.toDataURL(value,{width:400,margin:4,errorCorrectionLevel:'M'}).then(result=>{if(!cancelled)qr=result;}).catch(()=>{if(!cancelled)error=copy('The QR code could not be displayed. Please refresh.','Kode QR belum dapat ditampilkan. Silakan muat ulang.');});return()=>{cancelled=true;};});
 async function refresh(){if(checking||simulating)return;const token=data.token;checking=true;error='';try{const response=await fetch(`/pay/${token}/status`,{cache:'no-store'});if(!response.ok)throw new Error();const result=await response.json();if(token===data.token)payment=result.payment;}catch{if(token===data.token)error=copy('We could not check the payment just now. We’ll try again shortly.','Status pembayaran belum dapat diperiksa. Kami akan mencoba lagi sebentar.');}finally{checking=false;}}
 async function simulate(){
  if(simulating||checking||!payment.sandbox||!pending)return;
  const token=data.token;simulating=true;error='';simulationMessage='';
  try{
   const response=await fetch(`/pay/${token}/simulate`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
   const result=await response.json();
   if(!response.ok)throw new Error(result.message??copy('Simulation could not be confirmed. Refresh payment status.','Simulasi belum dapat dikonfirmasi. Periksa status pembayaran.'));
   if(token===data.token)simulationMessage=copy('Sandbox simulation requested. Checking confirmation…','Simulasi sandbox diminta. Memeriksa konfirmasi…');
  }catch(e){if(token===data.token)error=e instanceof Error?e.message:copy('Simulation failed. Please refresh payment status.','Simulasi gagal. Silakan periksa status pembayaran.');}
  finally{simulating=false;}
  if(token===data.token&&!error)await refresh();
 }
 onMount(()=>{const timer=setInterval(()=>{now=Date.now();if(!document.hidden&&['pending','preparing'].includes(payment.state))void refresh();},15000);return()=>clearInterval(timer);});
</script>
<svelte:head>
 <title>{copy('QRIS payment','Pembayaran QRIS')} · CapyBudget</title>
 <meta name="robots" content="noindex,nofollow"/>
 <meta name="referrer" content="no-referrer"/>
</svelte:head>
<main class="mx-auto flex min-h-dvh max-w-xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
 <header class="flex items-center gap-3"><CapyMascot size={44}/><div><p class="font-heading text-xl font-semibold">CapyBudget</p><p class="text-sm text-muted-foreground">{copy('A calm way to pay','Bayar dengan tenang')}</p></div></header>
 <Card.Root><Card.Header><p class="text-sm font-semibold text-muted-foreground">{payment.businessName}</p><Card.Title class="text-2xl">{copy('Pay with QRIS','Bayar dengan QRIS')}</Card.Title><Card.Description>{copy('Invoice','Faktur')} {payment.invoiceNumber}</Card.Description></Card.Header>
 <Card.Content class="space-y-6">
  {#if payment.sandbox}<p class="rounded-[14px] border-2 border-border bg-muted p-3 text-sm font-semibold">{copy('Sandbox payment — for testing only. Do not send real money.','Pembayaran sandbox — hanya untuk pengujian. Jangan kirim uang sungguhan.')}</p>{/if}
  <dl class="space-y-3 text-sm"><div class="flex justify-between gap-4"><dt>{copy('Invoice amount','Jumlah faktur')}</dt><dd class="tabular-nums">{money(payment.amount)}</dd></div>{#if payment.fee!==null}<div class="flex justify-between gap-4"><dt>{copy('Payment fee','Biaya pembayaran')}</dt><dd class="tabular-nums">{money(payment.fee)}</dd></div>{/if}<div class="flex items-center justify-between gap-4 border-t-2 border-border pt-4"><dt class="font-semibold">{copy('Total to pay','Total pembayaran')}</dt><dd class="text-2xl font-bold tabular-nums">{money(payment.totalPayment??payment.amount)}</dd></div></dl>
  <div role="status" aria-live="polite" class="space-y-3 text-center">
   {#if payment.state==='paid'}<h2 class="text-xl font-heading">{copy('Payment received. Thank you!','Pembayaran diterima. Terima kasih!')}</h2><p class="text-sm text-muted-foreground">{copy('Your payment has been confirmed by the provider.','Pembayaran Anda sudah dikonfirmasi oleh penyedia.')}</p>
   {:else if payment.state==='refunded'}<h2 class="text-xl font-heading">{copy('Payment refunded','Pembayaran dikembalikan')}</h2><p class="text-sm text-muted-foreground">{copy('Contact the business if you need details.','Hubungi bisnis jika Anda membutuhkan detail.')}</p>
   {:else if payment.state==='expired'||expired}<h2 class="text-xl font-heading">{copy('This QR code has expired','Kode QR ini sudah kedaluwarsa')}</h2><p class="text-sm text-muted-foreground">{copy('Ask the business for a new payment link. If you already paid, refresh to check confirmation before paying again.','Minta tautan pembayaran baru kepada bisnis. Jika sudah membayar, periksa konfirmasi sebelum membayar lagi.')}</p>
   {:else if payment.state==='unavailable'}<h2 class="text-xl font-heading">{copy('This invoice is no longer awaiting payment','Faktur ini tidak lagi menunggu pembayaran')}</h2><p class="text-sm text-muted-foreground">{copy('Contact the business before making another payment.','Hubungi bisnis sebelum melakukan pembayaran lain.')}</p>
   {:else if pending}<p class="font-semibold">{copy('Waiting for payment','Menunggu pembayaran')}</p>
    {#if qr}<img src={qr} alt={copy('QRIS code for this invoice payment','Kode QRIS untuk pembayaran faktur ini')} width="400" height="400" class="mx-auto h-auto w-full max-w-[320px] rounded-[14px]"/><Button href={qr} download="capybudget-qris.png" variant="outline">{copy('Save QR code','Simpan kode QR')}</Button>{:else}<p>{copy('Preparing your QR code…','Menyiapkan kode QR…')}</p>{/if}
    {#if payment.sandboxPlaceholder}<p class="text-sm text-muted-foreground">{copy('This is a sandbox sample QR code, not a payable QRIS code. Use the Simulate payment button below to test confirmation.','Ini adalah contoh kode QR sandbox, bukan QRIS yang dapat dibayar. Gunakan tombol Simulasikan pembayaran di bawah untuk menguji konfirmasi.')}</p>{:else}<p class="text-sm text-muted-foreground">{copy('Scan with a QRIS-supported banking or e-wallet app. On this phone, save the QR code and choose it from your payment app’s gallery.','Pindai dengan aplikasi bank atau dompet digital yang mendukung QRIS. Di ponsel ini, simpan kode QR lalu pilih dari galeri aplikasi pembayaran Anda.')}</p>{/if}
   {:else}<h2 class="text-xl font-heading">{copy('Preparing your payment','Menyiapkan pembayaran Anda')}</h2><p class="text-sm text-muted-foreground">{copy('Your QR code will appear once its details are confirmed.','Kode QR akan muncul setelah detailnya dikonfirmasi.')}</p>{/if}
  </div>
  {#if payment.expiresAt&&pending}<p class="text-center text-sm text-muted-foreground">{copy('Valid until','Berlaku sampai')} {formatDateTime(payment.expiresAt)}</p>{/if}
  {#if payment.sandbox&&pending}<div class="space-y-2"><Button class="w-full" disabled={checking||simulating} onclick={simulate}>{simulating?copy('Simulating…','Mensimulasikan…'):copy('Simulate payment','Simulasikan pembayaran')}</Button><p class="text-center text-xs text-muted-foreground">{copy('Completes this sandbox payment and records a test receipt. No real money moves.','Menyelesaikan pembayaran sandbox ini dan mencatat penerimaan uji. Tidak ada uang sungguhan yang berpindah.')}</p></div>{/if}
  {#if simulationMessage&&payment.state!=='paid'}<p role="status" class="text-sm">{simulationMessage}</p>{/if}
  {#if error}<p role="alert" class="text-sm">{error}</p>{/if}
  <Button class="w-full" variant="secondary" disabled={checking||simulating} onclick={refresh}>{checking?copy('Checking…','Memeriksa…'):copy('Refresh payment status','Periksa status pembayaran')}</Button>
  <p class="text-center text-xs text-muted-foreground">{copy('Confirmation updates automatically. It can take about a minute after payment.','Konfirmasi diperbarui otomatis. Proses ini dapat memerlukan sekitar satu menit setelah pembayaran.')}</p>
 </Card.Content></Card.Root>
 <footer class="text-center text-xs text-muted-foreground">{copy('QRIS payments processed by Pakasir. No CapyBudget account needed.','Pembayaran QRIS diproses oleh Pakasir. Tidak perlu akun CapyBudget.')}</footer>
</main>
