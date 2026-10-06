type Copy = readonly [string, string];
export type PageGuide = { summary: Copy; note: Copy };
/** Page-purpose descriptions shared by the app’s information cards. */
export const PAGE_GUIDES: Record<string, PageGuide> = {
 '/dashboard': {
  summary:['Balances show recorded money; income and expenses summarize the displayed period. Safe to spend is a forecast estimate, not your full balance.','Saldo menunjukkan uang yang tercatat; pemasukan dan pengeluaran merangkum periode yang ditampilkan. Aman dibelanjakan adalah estimasi prakiraan, bukan seluruh saldo.'],
  note:['These figures depend on your saved transactions. A missing transaction can change the picture; this page does not check your bank balance live.','Angka ini bergantung pada transaksi tersimpan. Transaksi yang belum dicatat dapat mengubah gambaran; halaman ini tidak memeriksa saldo bank secara langsung.']
 },
 '/transactions': {
  summary:['Income adds money, expenses reduce it, and transfers move money between your own accounts without becoming income or spending.','Pemasukan menambah uang, pengeluaran menguranginya, dan transfer memindahkan uang antar akun sendiri tanpa menjadi pemasukan atau pengeluaran.'],
  note:['Record a payment once. If a recurring entry or import already recorded it, review that entry before adding another.','Catat pembayaran sekali saja. Jika transaksi berulang atau impor sudah mencatatnya, periksa catatan tersebut sebelum menambah yang baru.']
 },
 '/accounts': {
  summary:['An account represents a place you keep money or a credit-card balance. Its balance comes from the opening amount and recorded activity.','Akun mewakili tempat menyimpan uang atau saldo kartu kredit. Saldonya berasal dari jumlah awal dan aktivitas tercatat.'],
  note:['A credit-card debt is a negative balance. Opening balances are starting amounts, not new income. Currency conversion depends on available exchange rates.','Utang kartu kredit berupa saldo negatif. Saldo awal adalah jumlah permulaan, bukan pemasukan baru. Konversi mata uang bergantung pada kurs yang tersedia.']
 },
 '/categories': {
  summary:['Categories explain what money was for. Subcategories add detail; tags help find related transactions across categories.','Kategori menjelaskan penggunaan uang. Subkategori menambah rincian; tag membantu menemukan transaksi terkait lintas kategori.'],
  note:['Use consistent names. Archiving a category stops new use while preserving its historical records.','Gunakan nama yang konsisten. Mengarsipkan kategori menghentikan penggunaan baru sambil mempertahankan riwayatnya.']
 },
 '/recurring': {
  summary:['A recurring rule schedules a repeated income, expense, or transfer. It records activity; it does not pay a bank or merchant.','Aturan berulang menjadwalkan pemasukan, pengeluaran, atau transfer rutin. Aturan mencatat aktivitas; bukan membayar bank atau merchant.'],
  note:['For the 31st, shorter months use their last day. Link related bill reminders to the recurring expense so the forecast can recognize the same payment.','Untuk tanggal 31, bulan lebih pendek memakai hari terakhirnya. Hubungkan pengingat tagihan terkait ke pengeluaran berulang agar prakiraan mengenali pembayaran yang sama.']
 },
 '/imports': {
  summary:['Statements and receipt scans prepare transaction suggestions. Review them before committing anything to your accounts.','Mutasi dan pindai struk menyiapkan saran transaksi. Tinjau sebelum memasukkan catatan ke akun Anda.'],
  note:['Scanning can misread text. Compare suggestions with the original document, especially totals and debit versus credit. Uploading a statement is not a live bank connection.','Pemindaian dapat salah membaca teks. Bandingkan saran dengan dokumen asli, terutama jumlah dan debit versus kredit. Unggah mutasi bukan koneksi bank langsung.']
 },
 '/budgets': {
  summary:['A category budget compares recorded spending with your weekly or monthly limit. A budget plan organizes allocations into the selected method’s buckets.','Anggaran kategori membandingkan pengeluaran tercatat dengan batas mingguan atau bulanan. Rencana anggaran mengatur alokasi dalam kelompok metode yang dipilih.'],
  note:['Zero remaining means the planned amount is used; a negative remainder means spending is above the plan. Budgets do not block transactions or reserve money at your bank.','Sisa nol berarti alokasi sudah digunakan; sisa negatif berarti pengeluaran melebihi rencana. Anggaran tidak memblokir transaksi atau menyisihkan uang di bank.']
 },
 '/goals': {
  summary:['A goal records how much you have set aside toward a target. The pool fills as recorded contributions increase.','Target mencatat jumlah yang disisihkan untuk tujuan tabungan. Kolam terisi seiring bertambahnya kontribusi tercatat.'],
  note:['Contributions update goal progress only. They do not transfer money or change account balances. Record actual movement between wallets separately as a transfer.','Kontribusi hanya memperbarui kemajuan target. Kontribusi tidak memindahkan uang atau mengubah saldo akun. Catat perpindahan uang antar dompet secara terpisah sebagai transfer.']
 },
 '/bills': {
  summary:['Bills remind you what is due. Forecast settings tell Capy when and from which account you expect to pay.','Tagihan mengingatkan kewajiban jatuh tempo. Pengaturan prakiraan memberi tahu Capy kapan dan dari akun mana Anda berencana membayar.'],
  note:['A forecast payment date is your plan, not a change to the supplier’s due date. Shared settings use the bill name and matching day of the month to identify related bills.','Tanggal pembayaran prakiraan adalah rencana Anda, bukan perubahan jatuh tempo pemasok. Pengaturan bersama memakai nama tagihan dan hari yang sama dalam bulan untuk mengenali tagihan terkait.']
 },
 '/debts': {
  summary:['Principal is the borrowed amount still owed. Interest and fees are separate costs. Annual interest (%) is the yearly rate used in payoff estimates.','Pokok adalah jumlah pinjaman yang masih terutang. Bunga dan biaya adalah beban terpisah. Bunga tahunan (%) adalah tingkat tahunan untuk estimasi pelunasan.'],
  note:['Payoff schedules are estimates, not lender statements. Extra monthly payment affects the simulation; confirm the payment details separately when recording what you paid.','Jadwal pelunasan adalah estimasi, bukan laporan pemberi pinjaman. Pembayaran tambahan bulanan memengaruhi simulasi; konfirmasi rincian secara terpisah saat mencatat pembayaran nyata.']
 },
 '/subscriptions': {
  summary:['Track a service’s regular charge and next charge date. Detection suggests possible subscriptions from repeated expenses.','Lacak biaya rutin layanan dan tanggal tagihan berikutnya. Deteksi menyarankan kemungkinan langganan dari pengeluaran berulang.'],
  note:['Monthly and yearly totals are estimates. Pausing or cancelling a record here does not cancel the subscription with the provider; arrange that directly.','Total bulanan dan tahunan adalah estimasi. Menjeda atau membatalkan catatan di sini tidak membatalkan langganan dengan penyedia; lakukan langsung kepada penyedia.']
 },
 '/net-worth': {
  summary:['Net worth is what you own (assets) minus what you owe (liabilities), calculated for a chosen date.','Kekayaan bersih adalah yang dimiliki (aset) dikurangi kewajiban (liabilitas), dihitung untuk tanggal pilihan.'],
  note:['Do not count the same item twice. Missing rates or valuations older than 90 days can make a snapshot incomplete; review its explanation before comparing totals.','Jangan hitung item yang sama dua kali. Kurs yang hilang atau penilaian lebih lama dari 90 hari dapat membuat snapshot tidak lengkap; tinjau penjelasannya sebelum membandingkan total.']
 },
 '/reports': {
  summary:['Reports summarize recorded activity for the selected period. Net activity is income minus expenses; cashflow explains the change from opening to closing cash.','Laporan merangkum aktivitas tercatat selama periode pilihan. Aktivitas bersih adalah pemasukan dikurangi pengeluaran; arus kas menjelaskan perubahan kas awal ke kas akhir.'],
  note:['Transfers within included accounts are not new income or expense. Downloaded files contain financial amounts even if privacy mode hides them on screen.','Transfer antar akun yang disertakan bukan pemasukan atau pengeluaran baru. File unduhan berisi jumlah keuangan meskipun mode privasi menyembunyikannya di layar.']
 },
 '/assistant': {
  summary:['Capy estimates the next 30, 60, or 90 days from the records you allow. Safe to spend leaves room for planned payments and protected money.','Capy memperkirakan 30, 60, atau 90 hari ke depan dari catatan yang Anda izinkan. Aman dibelanjakan menyisakan ruang untuk pembayaran terencana dan uang terlindungi.'],
  note:['Forecasts are estimates, not professional financial advice. Capy does not move bank money. Unavailable estimates need a review of missing records or excluded data, not an assumption of zero.','Prakiraan adalah estimasi, bukan nasihat keuangan profesional. Capy tidak memindahkan uang bank. Estimasi tidak tersedia membutuhkan tinjauan catatan yang hilang atau data yang dikecualikan, bukan dianggap nol.']
 },
 '/notifications': {
  summary:['Notifications point to bills, budgets, account balances, and unusual spending that may need your attention.','Notifikasi menunjukkan tagihan, anggaran, saldo akun, dan pengeluaran tidak biasa yang mungkin perlu ditinjau.'],
  note:['Reading a reminder does not pay a bill or fix the underlying record. An unusual-spending alert is a prompt to review, not proof of fraud.','Membaca pengingat tidak membayar tagihan atau memperbaiki catatan terkait. Peringatan pengeluaran tidak biasa adalah ajakan meninjau, bukan bukti penipuan.']
 },
 '/settings/appearance': {
  summary:['Change the light or Night Pond theme and choose English or Bahasa Indonesia for the interface.','Ubah tema terang atau Night Pond dan pilih English atau Bahasa Indonesia untuk antarmuka.'],
  note:['These choices change the interface, not saved transaction amounts, account currencies, or your own category names.','Pilihan ini mengubah antarmuka, bukan jumlah transaksi, mata uang akun, atau nama kategori buatan Anda.']
 },
 '/settings/notifications': {
  summary:['A low-balance rule compares recorded money with your limit. Unusual-spending rules compare expenses with prior history.','Aturan saldo rendah membandingkan uang tercatat dengan batas Anda. Aturan pengeluaran tidak biasa membandingkan pengeluaran dengan riwayat sebelumnya.'],
  note:['Rules use saved records, not live bank balances. Unusual-spending detection needs enough history before it can make a comparison.','Aturan memakai catatan tersimpan, bukan saldo bank langsung. Deteksi pengeluaran tidak biasa membutuhkan cukup riwayat untuk perbandingan.']
 },
 '/settings/security': {
  summary:['Two-factor authentication protects sign-in. A PIN or supported device unlock protects access to this browser after it locks.','Autentikasi dua faktor melindungi login. PIN atau buka kunci perangkat yang didukung melindungi akses browser ini setelah terkunci.'],
  note:['Your app PIN cannot authorize account-security changes. Signing out the current session ends your access here; removing a browser also revokes its sessions and unlock credentials.','PIN aplikasi tidak dapat mengizinkan perubahan keamanan akun. Keluar dari sesi saat ini mengakhiri akses di sini; menghapus browser juga mencabut sesi dan kredensial buka kuncinya.']
 },
 '/settings/privacy': {
  summary:['Privacy mode hides displayed amounts. Data export downloads your records; account deletion permanently removes your owned workspaces and retained files.','Mode privasi menyembunyikan jumlah di layar. Ekspor data mengunduh catatan; penghapusan akun menghapus permanen ruang kerja milik Anda dan berkas tersimpan.'],
  note:['Hidden amounts remain in downloaded exports. Deletion cannot recall previously delivered emails or downloads. Backup status reports server backups, not a copy stored on your device.','Jumlah tersembunyi tetap ada dalam ekspor unduhan. Penghapusan tidak menarik email terkirim atau unduhan sebelumnya. Status cadangan menunjukkan cadangan server, bukan salinan pada perangkat Anda.']
 },
 '/invoices': {
  summary:['Invoices record what customers owe your business. This page shows draft, sent, paid, and overdue invoices with their remaining balances.','Faktur mencatat kewajiban pelanggan kepada bisnis Anda. Halaman ini menampilkan faktur draf, terkirim, lunas, dan lewat jatuh tempo beserta sisa pembayarannya.'],
  note:['Issuing or sending an invoice is not a payment. Recorded payments reduce the unpaid balance; overdue means the due date has passed with money still owed.','Menerbitkan atau mengirim faktur bukan pembayaran. Pembayaran tercatat mengurangi sisa tagihan; lewat jatuh tempo berarti tanggal jatuh tempo terlewati dan masih ada jumlah terutang.']
 },
 '/invoices/new': {
  summary:['Create an invoice with customer details, dates, currency, items, quantities, discounts, and any configured tax. Saving creates a draft for review.','Buat faktur dengan detail pelanggan, tanggal, mata uang, item, jumlah unit, diskon, dan pajak yang dikonfigurasi. Penyimpanan membuat draf untuk ditinjau.'],
  note:['Customer and catalog selections copy details into this invoice. Later directory changes do not update the saved copy. Issuing and sending are separate actions after saving.','Pilihan pelanggan dan katalog menyalin detail ke faktur ini. Perubahan direktori berikutnya tidak memperbarui salinan tersimpan. Penerbitan dan pengiriman adalah tindakan terpisah setelah penyimpanan.']
 },
 '/invoices/[invoiceId]': {
  summary:['This invoice shows the customer’s bill, payment status, remaining amount, and payment history. Available actions include draft editing, PDF export, sending, and recording payments.','Faktur ini menunjukkan tagihan pelanggan, status pembayaran, sisa jumlah, dan riwayat pembayaran. Tindakan tersedia mencakup mengubah draf, ekspor PDF, pengiriman, dan pencatatan pembayaran.'],
  note:['Payment links require a configured payment connection. A generated link does not mean payment was received; its verified payment result and settlement records determine the recorded status.','Tautan pembayaran memerlukan koneksi pembayaran yang dikonfigurasi. Tautan yang dibuat tidak berarti pembayaran diterima; hasil pembayaran terverifikasi dan catatan penyelesaian menentukan status tercatat.']
 },
 '/business/recurring-invoices': {
  summary:['Recurring invoice templates copy a saved invoice’s customer, items, and prices on a repeating schedule. Each scheduled date has its own generated invoice and processing status.','Templat faktur berulang menyalin pelanggan, item, dan harga faktur tersimpan sesuai jadwal rutin. Setiap tanggal memiliki faktur yang dibuat dan status pemrosesannya sendiri.'],
  note:['Templates can create drafts, issue invoices, or issue and email them. Pausing stops new scheduled generation; existing invoices and queued work remain. Resuming may process missed dates.','Templat dapat membuat draf, menerbitkan faktur, atau menerbitkan dan mengirim email. Menjeda menghentikan pembuatan jadwal baru; faktur yang ada dan pekerjaan dalam antrean tetap tersimpan. Melanjutkan dapat memproses tanggal yang terlewat.']
 },
 '/business/payables': {
  summary:['Supplier bills track what your business owes for purchased goods or services. Drafts hold details for review; finalized bills track due dates, payments, and unpaid amounts.','Tagihan pemasok melacak kewajiban bisnis atas pembelian barang atau jasa. Draf menyimpan detail untuk ditinjau; tagihan terkonfirmasi melacak jatuh tempo, pembayaran, dan sisa jumlah.'],
  note:['A bill total and an unpaid balance are different: partial payments reduce what remains. Recording a payment documents money already paid; the app does not send money to the supplier.','Total tagihan berbeda dari sisa pembayaran: pembayaran sebagian mengurangi sisa jumlah. Pencatatan pembayaran mendokumentasikan uang yang sudah dibayar; aplikasi tidak mengirim uang ke pemasok.']
 },
 '/business/payables/[billId]': {
  summary:['This supplier bill shows purchased items, due dates, recorded payments, and any unpaid balance. Finalized bills can receive full or partial payment records.','Tagihan pemasok ini menunjukkan item pembelian, jatuh tempo, pembayaran tercatat, dan sisa jumlah yang belum dibayar. Tagihan terkonfirmasi dapat menerima pencatatan pembayaran penuh atau sebagian.'],
  note:['Linking an existing expense avoids recording the same payment twice. Reversing a payment corrects its record; cancelling a bill preserves its history. Neither action arranges a real bank refund.','Menghubungkan pengeluaran yang ada menghindari pencatatan pembayaran ganda. Membalikkan pembayaran mengoreksi catatannya; membatalkan tagihan mempertahankan riwayat. Keduanya tidak mengurus pengembalian dana bank nyata.']
 },
 '/business/accounting': {
  summary:['Accounting organizes business records into income, expenses, assets, liabilities, and the owner’s share. Cash reports follow payments; accrual reports follow issued invoices and supplier bills.','Akuntansi mengatur catatan bisnis menjadi pendapatan, beban, aset, liabilitas, dan bagian pemilik. Laporan kas mengikuti pembayaran; laporan akrual mengikuti faktur dan tagihan pemasok yang diterbitkan.'],
  note:['Accrual activation requires a reviewed start date and owner confirmation. Closing a period locks new postings through that date; balanced totals alone do not confirm every record is correct.','Aktivasi akrual membutuhkan tanggal mulai yang ditinjau dan konfirmasi pemilik. Penutupan periode mengunci pencatatan baru hingga tanggal tersebut; total seimbang saja tidak memastikan semua catatan benar.']
 },
 '/business/aging': {
  summary:['Receivables are unpaid customer invoices; payables are unpaid supplier bills. Aging groups these balances by how long they have been overdue as of the selected date.','Piutang adalah faktur pelanggan yang belum lunas; utang usaha adalah tagihan pemasok yang belum lunas. Umur tagihan mengelompokkan saldo menurut lamanya melewati jatuh tempo pada tanggal pilihan.'],
  note:['Not due and overdue amounts are shown separately, and different currencies stay separate. These are unpaid document balances, not available cash or guaranteed future income.','Jumlah belum jatuh tempo dan lewat jatuh tempo ditampilkan terpisah, begitu pula mata uang berbeda. Ini adalah sisa pembayaran dokumen, bukan kas tersedia atau jaminan pemasukan mendatang.']
 },
 '/business/projects': {
  summary:['Project profitability compares the revenue and costs allocated to each project or client. The cash report follows recorded payments and keeps different currencies separate.','Profitabilitas proyek membandingkan pendapatan dan biaya yang dialokasikan ke proyek atau klien. Laporan kas mengikuti pembayaran tercatat dan memisahkan mata uang berbeda.'],
  note:['Allocations organize existing invoices, supplier bills, and transactions. They do not create another payment or duplicate the original financial entry. Unallocated activity is not part of a project’s totals.','Alokasi mengatur faktur, tagihan pemasok, dan transaksi yang ada. Alokasi tidak membuat pembayaran baru atau menggandakan catatan keuangan asli. Aktivitas yang belum dialokasikan tidak termasuk total proyek.']
 },
 '/business/contacts': {
  summary:['The directory stores customer and supplier contact details. A contact can be a customer, a vendor, or both, and can supply details for invoices and supplier bills.','Direktori menyimpan detail kontak pelanggan dan pemasok. Kontak dapat berupa pelanggan, pemasok, atau keduanya, dan menyediakan detail untuk faktur serta tagihan pemasok.'],
  note:['Saved documents keep their own contact snapshots. Editing a contact affects future selections; it does not rewrite existing invoices or bills. Archived contacts remain in historical records.','Dokumen tersimpan menyimpan salinan detail kontaknya sendiri. Mengubah kontak memengaruhi pilihan berikutnya; bukan menulis ulang faktur atau tagihan yang ada. Kontak yang diarsipkan tetap ada dalam riwayat.']
 },
 '/business/catalog': {
  summary:['Products and services store reusable descriptions, prices, and currencies for invoice items. They help keep customer billing consistent.','Produk dan jasa menyimpan deskripsi, harga, dan mata uang yang dapat digunakan kembali pada item faktur. Katalog membantu menjaga konsistensi tagihan pelanggan.'],
  note:['Selecting an item copies its details into the invoice. Price changes affect future selections, not saved invoices. This catalog does not track stock quantities or inventory costs.','Memilih item menyalin detail ke faktur. Perubahan harga memengaruhi pilihan berikutnya, bukan faktur tersimpan. Katalog ini tidak melacak jumlah stok atau biaya persediaan.']
 },
 '/business/payments': {
  summary:['Payment connections let this business create Pakasir QRIS payment links for invoices. Each connection defines its environment, receiving account, and income category.','Koneksi pembayaran memungkinkan bisnis membuat tautan pembayaran QRIS Pakasir untuk faktur. Setiap koneksi menentukan lingkungan, akun penerimaan, dan kategori pemasukan.'],
  note:['Sandbox is for simulated payments; live connections use real provider settings. Verified provider results control payment recording. Disabling a connection prevents new use but keeps its history.','Sandbox digunakan untuk simulasi pembayaran; koneksi produksi memakai pengaturan penyedia nyata. Hasil penyedia terverifikasi mengatur pencatatan pembayaran. Menonaktifkan koneksi mencegah penggunaan baru tetapi mempertahankan riwayatnya.']
 },
 '/business/team': {
  summary:['Team access manages who can use this business workspace and which actions their role allows. Invitations, current members, and ownership are managed separately.','Akses tim mengelola siapa yang dapat memakai ruang kerja bisnis dan tindakan yang diizinkan perannya. Undangan, anggota saat ini, dan kepemilikan dikelola terpisah.'],
  note:['An invitation is not active membership until accepted. Removing a member revokes their workspace access while preserving financial records and the history of their actions.','Undangan bukan keanggotaan aktif sampai diterima. Menghapus anggota mencabut akses ruang kerja sambil mempertahankan catatan keuangan dan riwayat tindakannya.']
 },
 '/business/audit': {
  summary:['The audit trail records business changes with the person, action, and time. Available details show what changed so activity can be reviewed and explained.','Riwayat audit mencatat perubahan bisnis beserta pelaku, tindakan, dan waktu. Rincian yang tersedia menunjukkan perubahan agar aktivitas dapat ditinjau dan dipahami.'],
  note:['Audit entries describe recorded actions; they do not undo a change. Corrections are made in the related feature and produce their own records.','Catatan audit menjelaskan tindakan tercatat; bukan membatalkan perubahan. Koreksi dilakukan melalui fitur terkait dan menghasilkan catatannya sendiri.']
 },
 '/business/tax': {
  summary:['Business tax stores this business’s tax settings and dated rates, and summarizes tax amounts on sales invoice lines. Tax remains off until configured and enabled.','Pajak bisnis menyimpan pengaturan pajak dan tarif bertanggal bisnis ini, serta merangkum jumlah pajak pada baris faktur penjualan. Pajak tetap nonaktif sampai dikonfigurasi dan diaktifkan.'],
  note:['Tax-base numerator and denominator define the fraction of the amount used for calculation; the statutory rate is applied to that base. The report is a sales summary, not a filed tax return or a calculation of input-tax credits.','Pembilang dan penyebut dasar pajak menentukan bagian jumlah yang dipakai untuk perhitungan; tarif resmi diterapkan pada dasar tersebut. Laporan adalah ringkasan penjualan, bukan SPT yang disampaikan atau perhitungan kredit pajak masukan.']
 },
 '/business/settings': {
  summary:['The business profile stores the seller’s identity and contact information used on invoices, including its name, address, and tax identification where relevant.','Profil bisnis menyimpan identitas dan informasi kontak penjual yang digunakan pada faktur, termasuk nama, alamat, dan identitas pajak bila diperlukan.'],
  note:['Each business workspace has its own profile and records. Updates are used for future invoice snapshots; previously issued documents retain their saved seller details.','Setiap ruang kerja bisnis memiliki profil dan catatannya sendiri. Pembaruan digunakan untuk salinan detail faktur berikutnya; dokumen yang telah diterbitkan mempertahankan detail penjual tersimpan.']
 }
};
export const guideCopy = (value: Copy, locale: 'en' | 'id') => value[locale === 'id' ? 1 : 0];

/** Resolve only supported detail routes; other pages keep exact matches. */
export function pageGuideFor(pathname: string): PageGuide | undefined {
 const path=pathname.replace(/\/$/,'');
 if(PAGE_GUIDES[path])return PAGE_GUIDES[path];
 if(/^\/invoices\/[^/]+$/.test(path))return PAGE_GUIDES['/invoices/[invoiceId]'];
 if(/^\/business\/payables\/[^/]+$/.test(path))return PAGE_GUIDES['/business/payables/[billId]'];
 return undefined;
}
