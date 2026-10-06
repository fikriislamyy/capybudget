<script lang="ts">
 import {getContext} from 'svelte';
 import {AUTH_UI_CONTEXT,type AuthUiState} from '$lib/i18n/auth';
 import * as Card from '$lib/components/ui/card';
 import MoneyDisplay from '$lib/components/shared/money-display.svelte';
 type Seller={legalName:string;tradingName:string;address:{street?:string;city?:string;region?:string;postalCode?:string;country?:string};contactEmail:string;phone:string;logoDocumentId:string|null};
 let {seller,workspaceId,currency,unsaved=false}:{seller:Seller;workspaceId:string;currency:string;unsaved?:boolean}=$props();
 const ui=getContext<AuthUiState>(AUTH_UI_CONTEXT),copy=(en:string,id:string)=>ui.locale==='id'?id:en;
 const address=$derived([seller.address.street,seller.address.city,seller.address.region,seller.address.postalCode,seller.address.country].filter(Boolean));
 const unit=$derived(currency==='IDR'?'100000':'100');
 const total=$derived(currency==='IDR'?'200000':'200');
 const logoUrl=$derived(seller.logoDocumentId?'/api/workspaces/'+workspaceId+'/business-documents/'+seller.logoDocumentId+'/download':'');
 let logoFailed=$state(false);
 $effect(()=>{void logoUrl;logoFailed=false;});
</script>
<Card.Root class="mt-6">
 <Card.Header>
  <Card.Title>{copy('Example invoice','Contoh faktur')}</Card.Title>
  <Card.Description>{copy('Your saved business profile, shown with a sample customer and purchase. This is a layout preview; the exported PDF may have different spacing.','Profil bisnis tersimpan, ditampilkan dengan contoh pelanggan dan pembelian. Ini adalah pratinjau tata letak; jarak pada PDF ekspor dapat berbeda.')}</Card.Description>
 </Card.Header>
 <Card.Content class="space-y-4">
  {#if unsaved}<p role="status" class="rounded-[14px] border border-border bg-muted p-4 text-sm">{copy('You have unsaved changes. Save the business profile to update this example.','Ada perubahan yang belum disimpan. Simpan profil bisnis untuk memperbarui contoh ini.')}</p>{/if}
  <article class="invoice-example" aria-label={copy('Sample invoice using the saved business profile','Contoh faktur menggunakan profil bisnis tersimpan')}>
   <header class="invoice-top">
    <div class="seller">
     {#if logoUrl&&!logoFailed}<img src={logoUrl} alt={copy('Saved business logo','Logo bisnis tersimpan')} onerror={()=>logoFailed=true}/>{/if}
     {#if logoFailed}<p class="muted">{copy('Saved logo could not be loaded.','Logo tersimpan tidak dapat dimuat.')}</p>{/if}
     <h2>{seller.tradingName||seller.legalName||copy('Business name not saved yet','Nama bisnis belum disimpan')}</h2>
     <address>{#each address as line}<span>{line}</span>{/each}{#if !address.length}<span>{copy('Business address not saved yet','Alamat bisnis belum disimpan')}</span>{/if}{#if seller.contactEmail}<span>{seller.contactEmail}</span>{/if}{#if seller.phone}<span>{seller.phone}</span>{/if}</address>
    </div>
    <div class="document-heading"><p class="document-title">{copy('INVOICE','FAKTUR')}</p><p class="font-semibold">EXAMPLE-001</p><span class="sample-badge">{copy('Sample only','Hanya contoh')}</span></div>
   </header>
   <dl class="dates"><div><dt>{copy('Issue date','Tanggal terbit')}</dt><dd>01-10-2026</dd></div><div><dt>{copy('Due date','Jatuh tempo')}</dt><dd>15-10-2026</dd></div></dl>
   <section class="bill-to"><h3>{copy('Bill to · sample customer','Ditagihkan kepada · contoh pelanggan')}</h3><p class="font-semibold">{copy('Example Customer','Pelanggan Contoh')}</p><p class="muted">{copy('Sample customer address','Contoh alamat pelanggan')}</p></section>
   <!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard users need focus to scroll the invoice table horizontally.) -->
   <div class="table-scroll" role="region" tabindex="0" aria-label={copy('Sample invoice items; scroll to see all columns','Item contoh faktur; gulir untuk melihat seluruh kolom')}>
    <table><caption class="sr-only">{copy('Sample purchase, not a saved transaction','Contoh pembelian, bukan transaksi tersimpan')}</caption><thead><tr><th>{copy('Description','Deskripsi')}</th><th class="number">{copy('Qty','Jumlah')}</th><th class="number">{copy('Unit price','Harga satuan')}</th><th class="number">{copy('Discount','Diskon')}</th><th class="number">{copy('Tax','Pajak')}</th><th class="number">{copy('Total','Total')}</th></tr></thead><tbody><tr><td>{copy('Example service','Contoh jasa')}</td><td class="number">2</td><td class="number"><MoneyDisplay amount={unit} {currency}/></td><td class="number"><MoneyDisplay amount="0" {currency}/></td><td class="number">0%</td><td class="number"><MoneyDisplay amount={total} {currency}/></td></tr></tbody></table>
   </div>
   <dl class="totals"><div><dt>{copy('Subtotal','Subtotal')}</dt><dd><MoneyDisplay amount={total} {currency}/></dd></div><div><dt>{copy('Discount','Diskon')}</dt><dd><MoneyDisplay amount="0" {currency}/></dd></div><div><dt>{copy('Tax · sample only','Pajak · hanya contoh')}</dt><dd><MoneyDisplay amount="0" {currency}/></dd></div><div class="grand-total"><dt>{copy('Total','Total')}</dt><dd><MoneyDisplay amount={total} {currency} size="lg"/></dd></div></dl>
   <footer>{seller.legalName||copy('Legal business name not saved yet','Nama legal bisnis belum disimpan')} · {currency}</footer>
  </article>
  <p class="text-sm leading-relaxed text-muted-foreground">{copy('The customer, invoice number, dates, amounts, and zero tax are examples. No invoice is saved or sent, no invoice number is reserved, and no reports or balances change.','Pelanggan, nomor faktur, tanggal, jumlah, dan pajak nol adalah contoh. Tidak ada faktur disimpan atau dikirim, nomor faktur tidak dipesan, serta laporan dan saldo tidak berubah.')}</p>
 </Card.Content>
</Card.Root>
<style>
 .invoice-example{padding:32px;border:2px solid var(--border);border-radius:var(--radius-input);background:var(--background);font-size:14px;line-height:1.6;overflow-wrap:anywhere}
 .invoice-top{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;border-bottom:2px solid var(--capy-fur);padding-bottom:24px}
 .seller{min-width:0}.seller img{display:block;width:auto;max-width:140px;height:56px;object-fit:contain;object-position:left center;margin-bottom:12px}
 h2{font:600 20px var(--font-heading);color:var(--brand-ink);margin:0 0 8px}
 address{font-style:normal;color:var(--muted-foreground)}address span{display:block}
 .document-heading{text-align:right;flex-shrink:0}.document-title{font:500 28px var(--font-heading);color:var(--brand-ink)}
 p{margin:0}.sample-badge{display:inline-flex;margin-top:8px;padding:4px 12px;border:1px solid var(--border);border-radius:9999px;background:var(--secondary);font-size:12px;font-weight:600;color:var(--secondary-foreground)}
 .muted,dt{color:var(--muted-foreground)}.dates{display:flex;flex-wrap:wrap;gap:24px;margin:24px 0}dd{margin:0;font-variant-numeric:tabular-nums}
 .bill-to{margin:24px 0}h3{font-size:14px;color:var(--brand-ink);font-weight:600;margin:0 0 8px}
 .table-scroll{overflow:auto;border-radius:var(--radius-input)}.table-scroll:focus-visible{outline:2px solid var(--ring);outline-offset:2px}
 table{width:100%;border-collapse:collapse;min-width:560px;text-align:left}th{padding:12px;background:var(--secondary);color:var(--secondary-foreground);font-size:12px;font-weight:600}td{padding:16px 12px;border-bottom:1px solid var(--border)}.number{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
 .totals{margin:24px 0 0 auto;max-width:320px;display:grid;gap:12px}.totals>div{display:flex;align-items:center;justify-content:space-between;gap:16px}.grand-total{border-top:2px solid var(--capy-fur);padding-top:16px}.grand-total dt{color:var(--brand-ink);font-weight:600}
 footer{margin-top:32px;padding-top:12px;border-top:1px solid var(--border);color:var(--muted-foreground);font-size:12px}
 @media(max-width:640px){.invoice-example{padding:16px}.invoice-top{flex-direction:column;gap:16px}.document-heading{text-align:left}.document-title{font-size:24px}.totals{max-width:none}}
</style>
