import {formatDate} from '$lib/dates';

type Pair = readonly [string, string];
const entities: Record<string, Pair> = {
 invoice: ['Invoice', 'Invoice'], vendor_bill: ['Supplier bill', 'Tagihan pemasok'],
 contact: ['Customer or vendor', 'Pelanggan atau pemasok'], catalog: ['Product or service', 'Produk atau layanan'],
 membership: ['Team membership', 'Keanggotaan tim'], invitation: ['Team invitation', 'Undangan tim'],
 payment_connection: ['Payment connection', 'Koneksi pembayaran'], payment_request: ['Payment request', 'Permintaan pembayaran'],
 payment_adjustment: ['Payment correction', 'Koreksi pembayaran'], recurring_invoice: ['Recurring invoice', 'Invoice berulang'],
 business_tax: ['Tax settings', 'Pengaturan pajak'], tax_reminder: ['Tax reminder', 'Pengingat pajak'],
 project: ['Project', 'Proyek'], project_allocation: ['Project income or cost', 'Pendapatan atau biaya proyek'], accounting: ['Accounting', 'Akuntansi']
};
const actions: Record<string, Pair> = {
 created: ['Created a record', 'Membuat catatan'], updated: ['Updated a record', 'Memperbarui catatan'], archived: ['Archived a record', 'Mengarsipkan catatan'],
 draft_created: ['Created a draft', 'Membuat draf'], draft_updated: ['Updated a draft', 'Memperbarui draf'], draft_archived: ['Archived a draft', 'Mengarsipkan draf'],
 issue: ['Finalized an invoice', 'Menerbitkan invoice'], issued: ['Finalized a supplier bill', 'Menerbitkan tagihan pemasok'],
 void: ['Cancelled an invoice', 'Membatalkan invoice'], voided: ['Cancelled a supplier bill', 'Membatalkan tagihan pemasok'],
 send_requested: ['Requested an invoice email', 'Meminta pengiriman email invoice'], payment_link_email_requested: ['Requested a payment link email', 'Meminta pengiriman email tautan pembayaran'],
 payment_recorded: ['Recorded an invoice payment', 'Mencatat pembayaran invoice'], paid: ['Recorded a supplier payment', 'Mencatat pembayaran pemasok'],
 payment_reversed: ['Reversed a recorded payment', 'Membatalkan pencatatan pembayaran'], collection_forecast_updated: ['Updated expected payment settings', 'Memperbarui pengaturan perkiraan pembayaran'],
 role_changed: ['Changed a team member’s role', 'Mengubah peran anggota tim'], member_removed: ['Removed a team member', 'Menghapus anggota tim'],
 owner_transferred: ['Transferred business ownership', 'Mengalihkan kepemilikan bisnis'], invitation_accepted: ['Joined the business team', 'Bergabung dengan tim bisnis'],
 invited: ['Invited a team member', 'Mengundang anggota tim'], revoked: ['Cancelled a team invitation', 'Membatalkan undangan tim'],
 disabled: ['Disabled a payment connection', 'Menonaktifkan koneksi pembayaran'], status_verified: ['Checked a payment connection', 'Memeriksa koneksi pembayaran'],
 sandbox_simulation_requested: ['Requested a test payment', 'Meminta simulasi pembayaran'], net_settlement_matched: ['Matched a payment and its fee', 'Mencocokkan pembayaran dan biayanya'],
 unapplied_funds_recorded: ['Recorded funds awaiting allocation', 'Mencatat dana yang belum dialokasikan'], refund_recorded: ['Recorded a refund', 'Mencatat pengembalian dana'],
 fee_recorded: ['Recorded a payment fee', 'Mencatat biaya pembayaran'], reversed: ['Reversed a payment correction', 'Membatalkan koreksi pembayaran'],
 paused: ['Paused recurring invoices', 'Menjeda invoice berulang'], resumed: ['Resumed recurring invoices', 'Melanjutkan invoice berulang'],
 recurring_draft_created: ['Created a scheduled invoice draft', 'Membuat draf invoice terjadwal'],
 tax_settings_changed: ['Updated tax settings', 'Memperbarui pengaturan pajak'], tax_rate_created: ['Added a tax rate', 'Menambahkan tarif pajak'], tax_rate_archived: ['Archived a tax rate', 'Mengarsipkan tarif pajak'],
 completed: ['Completed a tax reminder', 'Menyelesaikan pengingat pajak'], saved: ['Saved a project income or cost allocation', 'Menyimpan alokasi pendapatan atau biaya proyek'], removed: ['Removed a project allocation', 'Menghapus alokasi proyek'],
 preview_created: ['Prepared an accounting conversion preview', 'Menyiapkan pratinjau peralihan akuntansi'], review_recorded: ['Recorded an accounting review', 'Mencatat peninjauan akuntansi'],
 cutover_applied: ['Activated accrual accounting', 'Mengaktifkan akuntansi akrual'], period_closed: ['Closed an accounting period', 'Menutup periode akuntansi'], statement_exported: ['Exported a financial statement', 'Mengekspor laporan keuangan']
};
const fields: Record<string, Pair> = {
 amount: ['Amount', 'Jumlah'], total: ['Total', 'Total'], currency: ['Currency', 'Mata uang'], number: ['Invoice number', 'Nomor invoice'],
 version: ['Record version', 'Versi catatan'], role: ['Team role', 'Peran tim'], from: ['Previous role / start date', 'Peran sebelumnya / tanggal mulai'], to: ['New role / end date', 'Peran baru / tanggal akhir'],
 effectiveOn: ['Effective date', 'Tanggal berlaku'], dueOn: ['Due date', 'Tanggal jatuh tempo'], cutoverOn: ['Accounting start date', 'Tanggal mulai akuntansi'], through: ['Period end date', 'Tanggal akhir periode'],
 enabled: ['Tax enabled', 'Pajak diaktifkan'], archived: ['Archived', 'Diarsipkan'], sandbox: ['Test mode', 'Mode uji coba'],
 matched: ['Matched to an existing transaction', 'Dicocokkan dengan transaksi yang ada'], kind: ['Contact type', 'Jenis kontak'],
 autoIssue: ['Finalize invoices automatically', 'Terbitkan invoice otomatis'], autoSend: ['Email invoices automatically', 'Kirim email invoice otomatis'],
 reason: ['Reason', 'Alasan'], name: ['Name', 'Nama'], sku: ['Product code', 'Kode produk'], status: ['Payment status', 'Status pembayaran'],
 rate: ['Tax rate', 'Tarif pajak'], statutory_rate: ['Tax rate', 'Tarif pajak'], baseNumerator: ['Taxable portion (numerator)', 'Bagian kena pajak (pembilang)'], baseDenominator: ['Taxable portion (denominator)', 'Bagian kena pajak (penyebut)'],
 inclusive: ['Price includes tax', 'Harga termasuk pajak'], effectiveFrom: ['Applies from', 'Berlaku mulai'], effectiveTo: ['Applies until', 'Berlaku sampai'], applicability: ['Applies to', 'Berlaku untuk'],
 jurisdiction: ['Tax country', 'Negara pajak'], basis: ['Report basis', 'Dasar laporan'], openingEntries: ['Opening accounting entries', 'Jumlah catatan akuntansi awal'],
 expected_collection_date: ['Expected payment date', 'Perkiraan tanggal pembayaran'], collection_probability: ['Likelihood of payment', 'Kemungkinan pembayaran'], include_in_forecast: ['Included in forecast', 'Disertakan dalam perkiraan']
};
const values: Record<string, Pair> = {
 owner: ['Owner', 'Pemilik'], accountant: ['Accountant', 'Akuntan'], staff: ['Staff', 'Staf'], viewer: ['Viewer (read only)', 'Pembaca (hanya lihat)'],
 customer: ['Customer', 'Pelanggan'], vendor: ['Vendor', 'Pemasok'], both: ['Customer and vendor', 'Pelanggan dan pemasok'],
 cash: ['Cash basis', 'Dasar kas'], accrual: ['Accrual basis', 'Dasar akrual'], ID: ['Indonesia', 'Indonesia'],
 SUCCESS: ['Payment successful', 'Pembayaran berhasil'], PENDING: ['Waiting for payment', 'Menunggu pembayaran'], FAILED: ['Payment failed', 'Pembayaran gagal'],
 sales: ['Sales', 'Penjualan'], purchases: ['Purchases', 'Pembelian'], all: ['Sales and purchases', 'Penjualan dan pembelian']
};
const pick = (pair: Pair, locale: string) => pair[locale === 'id' ? 1 : 0];
const words = (value: string) => value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/^./, letter => letter.toUpperCase());
const uuid = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i;
export const auditEntity = (value: string, locale: string) => entities[value] ? pick(entities[value], locale) : words(value);
export const auditAction = (value: string, locale: string) => actions[value] ? pick(actions[value], locale) : (locale === 'id' ? 'Aktivitas bisnis tercatat' : 'Business activity recorded');
export const auditFilters = (locale: string) => [{value: '', label: locale === 'id' ? 'Semua jenis catatan' : 'All record types'}, ...Object.keys(entities).map(value => ({value, label: auditEntity(value, locale)}))];
export type AuditField = {key: string; label: string; before: unknown; after: unknown; hasBefore: boolean; hasAfter: boolean; currency: string};
export function auditFields(before: unknown, after: unknown, locale: string, action: string): AuditField[] {
 const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
 const old = object(before), next = object(after);
 return [...new Set([...Object.keys(old), ...Object.keys(next)])]
  .filter(key => !/(^id$|_id$|Id$|fingerprint|hash|workspace|created_at|updated_at|templateVersion)/i.test(key))
  .filter(key => ![old[key], next[key]].some(value => typeof value === 'string' && uuid.test(value)))
  .filter(key => !(key in old && key in next && JSON.stringify(old[key]) === JSON.stringify(next[key])))
  .map(key => ({key, label: key === 'from' && action === 'statement_exported' ? pick(['Report start date', 'Tanggal mulai laporan'], locale) : key === 'to' && action === 'statement_exported' ? pick(['Report end date', 'Tanggal akhir laporan'], locale) : key === 'from' && action === 'role_changed' ? pick(['Previous role', 'Peran sebelumnya'], locale) : key === 'to' && action === 'role_changed' ? pick(['New role', 'Peran baru'], locale) : fields[key] ? pick(fields[key], locale) : words(key), before: old[key], after: next[key], hasBefore: key in old, hasAfter: key in next, currency: String(next.currency ?? old.currency ?? '')}));
}
export function auditValue(value: unknown, locale: string): string {
 if(value === null || value === undefined || value === '') return locale === 'id' ? 'Tidak diatur' : 'Not set';
 if(typeof value === 'boolean') return pick(value ? ['Yes', 'Ya'] : ['No', 'Tidak'], locale);
 if(Array.isArray(value)) return value.map(item => auditValue(item, locale)).join(', ') || '—';
 if(typeof value === 'object') return Object.entries(value).map(([key, item]) => `${fields[key] ? pick(fields[key], locale) : words(key)}: ${auditValue(item, locale)}`).join('; ') || '—';
 const text = String(value);
 if(/^\d{4}-\d{2}-\d{2}(?:$|T)/.test(text)) return formatDate(text);
 return values[text] ? pick(values[text], locale) : text;
}
export const auditMoney = (key: string, value: unknown) => /^(amount|total|subtotal|tax_total|discount_total)$/.test(key) && typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value);
