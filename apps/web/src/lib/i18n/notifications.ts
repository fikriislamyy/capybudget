import type { Locale } from './auth';

export type NoticeMessage = { kind: string; messageKey?: string; title: string; message: string; messageParams?: Record<string, unknown> | null };

function money(value: unknown, currency: unknown, locale: Locale): string {
  const raw = String(value ?? '0');
  if (!/^-?\d+(?:\.\d+)?$/.test(raw)) return `${String(currency ?? '')} ${raw}`;
  const negative = raw.startsWith('-');
  const [whole = '0', fraction] = (negative ? raw.slice(1) : raw).split('.');
  const formattedWhole = new Intl.NumberFormat(locale === 'id' ? 'id-ID' : 'en-US', { maximumFractionDigits: 0 }).format(BigInt(whole));
  const decimal = new Intl.NumberFormat(locale === 'id' ? 'id-ID' : 'en-US').formatToParts(1.1).find((part) => part.type === 'decimal')?.value ?? '.';
  return `${String(currency ?? '')} ${negative ? '-' : ''}${formattedWhole}${fraction ? decimal + fraction : ''}`;
}

export function notificationTitle(item: NoticeMessage, locale: Locale): string {
  const p = item.messageParams ?? {}, id = locale === 'id';
  if (item.messageKey === 'forecast.shortfall') return id ? 'Perkiraan kekurangan saldo' : 'Projected cash shortfall';
  if (item.messageKey === 'forecast.low_balance') return id ? 'Saldo diperkirakan rendah' : 'Projected low balance';
  if (item.messageKey === 'forecast.invoice_followup') return id ? 'Faktur menunggu pembayaran' : 'Invoice needs follow-up';
  if (item.messageKey === 'invoice.overdue') return id ? `Faktur ${p.number ?? ''} telah jatuh tempo` : `Invoice ${p.number ?? ''} is overdue`;
  if (item.messageKey === 'invoice.today') return id ? `Faktur ${p.number ?? ''} jatuh tempo hari ini` : `Invoice ${p.number ?? ''} is due today`;
  if (item.messageKey === 'invoice.upcoming') return id ? `Faktur ${p.number ?? ''} segera jatuh tempo` : `Invoice ${p.number ?? ''} is due soon`;
  if (item.messageKey === 'bill.overdue') return id ? `${p.name ?? 'Tagihan'} telah jatuh tempo` : `${p.name ?? 'Bill'} is overdue`;
  if (item.messageKey === 'bill.today') return id ? `${p.name ?? 'Tagihan'} jatuh tempo hari ini` : `${p.name ?? 'Bill'} is due today`;
  if (item.messageKey === 'bill.upcoming') return id ? `${p.name ?? 'Tagihan'} segera jatuh tempo` : `${p.name ?? 'Bill'} is due soon`;
  if (item.messageKey === 'payment.today') return id ? `${p.name ?? 'Pembayaran'} jatuh tempo hari ini` : `${p.name ?? 'Payment'} is due today`;
  if (item.messageKey === 'payment.upcoming') return id ? `${p.name ?? 'Pembayaran'} segera jatuh tempo` : `${p.name ?? 'Payment'} is due soon`;
  if (item.messageKey === 'payment.overdue') return id ? `${p.name ?? 'Pembayaran'} telah jatuh tempo` : `${p.name ?? 'Payment'} is overdue`;
  if (item.messageKey === 'balance.low') return id ? `${p.name ?? 'Akun'} di bawah batas saldo` : `${p.name ?? 'Account'} is below your balance limit`;
  if (item.messageKey === 'spending.unusual') return id ? 'Pengeluaran ini lebih tinggi dari biasanya' : 'This expense is higher than usual';
  if (item.messageKey === 'budget.threshold') return id ? `Anggaran ${p.category ?? ''} terpakai ${p.threshold}%` : `${p.category ?? 'Budget'} budget at ${p.threshold}%`;
  if (item.messageKey === 'budget.zero') return id ? `${p.category ?? 'Anggaran'} memiliki pengeluaran pada batas nol` : `${p.category ?? 'Budget'} has spending against a zero budget`;
  return item.title;
}

export function notificationMessage(item: NoticeMessage, locale: Locale): string {
  const p = item.messageParams ?? {}, id = locale === 'id';
  if (item.messageKey?.startsWith('forecast.')) return `${id ? 'Tinjau proyeksi arus kas untuk' : 'Review the cashflow forecast for'} ${p.date ?? p.dueDate ?? ''}.`;
  if (item.messageKey?.startsWith('invoice.')) return `${id ? 'Sisa' : 'Outstanding'}: ${money(p.amount, p.currency, locale)} · ${p.dueDate ?? ''}`;
  if (item.messageKey === 'bill.overdue' || item.messageKey === 'bill.today' || item.messageKey === 'bill.upcoming' || item.messageKey?.startsWith('payment.')) return `${money(p.amount, p.currency, locale)} · ${p.dueDate ?? ''}`;
  if (item.messageKey === 'balance.low') return `${id ? 'Saldo tercatat' : 'Recorded balance'}: ${money(p.balance, p.currency, locale)} · ${id ? 'Batas' : 'Limit'}: ${money(p.threshold, p.currency, locale)}`;
  if (item.messageKey === 'budget.threshold') return `${money(p.spent, p.currency, locale)} ${id ? 'dari' : 'of'} ${money(p.amount, p.currency, locale)}`;
  if (item.messageKey === 'budget.zero') return `${money(p.spent, p.currency, locale)} ${id ? 'dibelanjakan pada anggaran nol' : 'spent against a zero budget'}`;
  if (item.messageKey === 'spending.unusual') return id ? 'Pengeluaran ini lebih tinggi daripada pola sebelumnya pada kategori dan mata uang yang sama. Ini bukan penilaian penipuan.' : 'This expense is above the recent pattern for the same category and currency. This is not a fraud determination.';
  return item.message;
}
