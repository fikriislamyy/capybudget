import type { Component } from 'svelte';
import DashboardIcon from '@lucide/svelte/icons/layout-dashboard';
import ReportsIcon from '@lucide/svelte/icons/chart-column';
import AssistantIcon from '@lucide/svelte/icons/bot';
import BellIcon from '@lucide/svelte/icons/bell';
import TxIcon from '@lucide/svelte/icons/arrow-left-right';
import WalletIcon from '@lucide/svelte/icons/wallet';
import TagsIcon from '@lucide/svelte/icons/tags';
import RepeatIcon from '@lucide/svelte/icons/repeat';
import BudgetIcon from '@lucide/svelte/icons/piggy-bank';
import GoalIcon from '@lucide/svelte/icons/target';
import BillIcon from '@lucide/svelte/icons/receipt';
import InvoiceIcon from '@lucide/svelte/icons/file-text';
import BusinessIcon from '@lucide/svelte/icons/briefcase';
import AppearanceIcon from '@lucide/svelte/icons/palette';
import NotifPrefIcon from '@lucide/svelte/icons/bell-ring';
import SecurityIcon from '@lucide/svelte/icons/shield-check';
import PrivacyIcon from '@lucide/svelte/icons/eye-off';

export type NavEntry = {
  href: string;
  en: string;
  id: string;
  icon: Component;
  businessOnly?: boolean;
};

export type NavGroup = { en: string; id: string; entries: NavEntry[] };

/** Single route configuration shared by the desktop sidebar and the mobile More sheet. */
export const NAV_GROUPS: NavGroup[] = [
  {
    en: 'Overview', id: 'Ringkasan',
    entries: [
      { href: '/dashboard', en: 'Dashboard', id: 'Dasbor', icon: DashboardIcon },
      { href: '/reports', en: 'Reports', id: 'Laporan', icon: ReportsIcon },
      { href: '/assistant', en: 'Assistant', id: 'Asisten', icon: AssistantIcon },
      { href: '/notifications', en: 'Notifications', id: 'Notifikasi', icon: BellIcon }
    ]
  },
  {
    en: 'Tracking', id: 'Pencatatan',
    entries: [
      { href: '/imports', en: 'Import & scan', id: 'Impor & pindai', icon: InvoiceIcon },
      { href: '/transactions', en: 'Transactions', id: 'Transaksi', icon: TxIcon },
      { href: '/accounts', en: 'Accounts', id: 'Akun', icon: WalletIcon },
      { href: '/categories', en: 'Categories', id: 'Kategori', icon: TagsIcon },
      { href: '/recurring', en: 'Recurring', id: 'Berulang', icon: RepeatIcon }
    ]
  },
  {
    en: 'Planning', id: 'Rencana',
    entries: [
      { href: '/budgets', en: 'Budgets', id: 'Anggaran', icon: BudgetIcon },
      { href: '/goals', en: 'Goals', id: 'Target', icon: GoalIcon },
      { href: '/bills', en: 'Bills', id: 'Tagihan', icon: BillIcon },
      { href: '/debts', en: 'Debts', id: 'Utang', icon: WalletIcon },
      { href: '/subscriptions', en: 'Subscriptions', id: 'Langganan', icon: RepeatIcon },
      { href: '/net-worth', en: 'Net worth', id: 'Kekayaan bersih', icon: ReportsIcon }
    ]
  },
  {
    en: 'Business', id: 'Bisnis',
    entries: [
      { href: '/invoices', en: 'Invoices', id: 'Faktur', icon: InvoiceIcon, businessOnly: true },
      { href: '/business/recurring-invoices', en: 'Recurring invoices', id: 'Faktur berulang', icon: RepeatIcon, businessOnly: true },
      { href: '/business/payables', en: 'Vendor bills', id: 'Tagihan pemasok', icon: BillIcon, businessOnly: true },
      { href: '/business/accounting', en: 'Accounting', id: 'Akuntansi', icon: ReportsIcon, businessOnly: true },
      { href: '/business/aging', en: 'Receivables & payables', id: 'Piutang & utang usaha', icon: ReportsIcon, businessOnly: true },
      { href: '/business/projects', en: 'Project profitability', id: 'Profitabilitas proyek', icon: BusinessIcon, businessOnly: true },
      { href: '/business/contacts', en: 'Customers & vendors', id: 'Pelanggan & pemasok', icon: BusinessIcon, businessOnly: true },
      { href: '/business/catalog', en: 'Products & services', id: 'Produk & jasa', icon: InvoiceIcon, businessOnly: true },
      { href: '/business/payments', en: 'Pakasir payments', id: 'Pembayaran Pakasir', icon: WalletIcon, businessOnly: true },
      { href: '/business/team', en: 'Team access', id: 'Akses tim', icon: BusinessIcon, businessOnly: true },
      { href: '/business/audit', en: 'Audit trail', id: 'Riwayat audit', icon: ReportsIcon, businessOnly: true },
      { href: '/business/tax', en: 'Business tax', id: 'Pajak bisnis', icon: BillIcon, businessOnly: true },
      { href: '/business/settings', en: 'Business profile', id: 'Profil bisnis', icon: BusinessIcon, businessOnly: true }
    ]
  },
  {
    en: 'Settings', id: 'Pengaturan',
    entries: [
      { href: '/settings/appearance', en: 'Appearance', id: 'Tampilan', icon: AppearanceIcon },
      { href: '/settings/notifications', en: 'Notification settings', id: 'Pengaturan notifikasi', icon: NotifPrefIcon },
      { href: '/settings/security', en: 'Security', id: 'Keamanan', icon: SecurityIcon },
      { href: '/settings/privacy', en: 'Privacy', id: 'Privasi', icon: PrivacyIcon }
    ]
  }
];

export function isActiveRoute(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + '/');
}

export function labelFor(entry: Pick<NavEntry, 'en' | 'id'>, locale: 'en' | 'id'): string {
  return locale === 'id' ? entry.id : entry.en;
}

export function visibleForRole(entry:NavEntry,isBusiness:boolean,role='owner'){
 if(entry.businessOnly&&!isBusiness)return false;
 if(!isBusiness)return true;
 if(['/business/team','/business/payments'].includes(entry.href))return role==='owner';
 if(entry.href==='/business/audit')return ['owner','accountant'].includes(role);
 if(role==='staff')return ['/invoices','/business/contacts','/business/catalog','/business/tax','/business/settings','/settings/appearance','/settings/security','/settings/privacy'].includes(entry.href);
 return true;
}
