import type { Locale } from './auth';

const messages = {
  en: {
    onboardingTitle: 'Welcome to CapyBudget', onboardingIntro: 'Four quick steps and your money pond is ready.',
    stepUsage: 'How will you use CapyBudget?', usagePersonal: 'Personal', usagePersonalHint: 'Budgets, goals, and everyday spending.',
    usageBusiness: 'Business', usageBusinessHint: 'Invoices, clients, and cashflow.', usageBoth: 'Both', usageBothHint: 'Keep personal and business side by side.',
    businessName: 'Business name', businessNamePlaceholder: 'Studio or shop',
    stepDetails: 'Currency and language', currency: 'Currency', currencyHint: 'Use a 3-letter code like IDR or USD.', language: 'Language',
    stepAccount: 'Your first wallet', accountName: 'Wallet name', accountNamePlaceholder: 'Cash or Main bank',
    accountType: 'Wallet type', openingBalance: 'Starting balance (optional)', openingHint: 'Leave 0 if you are starting fresh today.',
    stepGoal: 'Budget or goal (optional)', goalChoiceBudget: 'Monthly budget', goalChoiceGoal: 'Savings goal', goalChoiceSkip: 'Skip for now',
    budgetCategory: 'Category', budgetAmount: 'Monthly amount', goalName: 'Goal name', goalNamePlaceholder: 'Emergency fund',
    goalTarget: 'Target amount', goalDate: 'Target date (optional)',
    back: 'Back', next: 'Continue', finish: 'Take me to my dashboard', saving: 'Saving…',
    quickAdd: 'Quick add', amount: 'Amount', category: 'Category', account: 'Wallet', note: 'Note (optional)',
    moreOptions: 'Wallet and note', save: 'Save', saved: 'Saved.', useSuggestion: 'Use suggestion',
    lastUsed: 'Last used', chooseCategory: 'Pick a category to finish.',
    appearance: 'Appearance', appearanceIntro: 'Theme and language apply on every device.',
    theme: 'Theme', themeLight: 'Light', themeDark: 'Dark', themeSystem: 'Match my device',
    offlineQueued: 'You are offline. Changes cannot be saved.',
    retry: 'Try again', errorTitle: 'Something went wrong', loading: 'Loading…', cancel: 'Cancel', typeLabel: 'Type'
  },
  id: {
    onboardingTitle: 'Selamat datang di CapyBudget', onboardingIntro: 'Empat langkah cepat dan kolam uang Anda siap.',
    stepUsage: 'Untuk apa Anda memakai CapyBudget?', usagePersonal: 'Pribadi', usagePersonalHint: 'Anggaran, target, dan pengeluaran harian.',
    usageBusiness: 'Bisnis', usageBusinessHint: 'Faktur, klien, dan arus kas.', usageBoth: 'Keduanya', usageBothHint: 'Pribadi dan bisnis berdampingan.',
    businessName: 'Nama bisnis', businessNamePlaceholder: 'Studio atau toko',
    stepDetails: 'Mata uang dan bahasa', currency: 'Mata uang', currencyHint: 'Gunakan kode 3 huruf seperti IDR atau USD.', language: 'Bahasa',
    stepAccount: 'Dompet pertama Anda', accountName: 'Nama dompet', accountNamePlaceholder: 'Tunai atau Bank utama',
    accountType: 'Jenis dompet', openingBalance: 'Saldo awal (opsional)', openingHint: 'Isi 0 jika mulai dari awal hari ini.',
    stepGoal: 'Anggaran atau target (opsional)', goalChoiceBudget: 'Anggaran bulanan', goalChoiceGoal: 'Target tabungan', goalChoiceSkip: 'Lewati dulu',
    budgetCategory: 'Kategori', budgetAmount: 'Jumlah bulanan', goalName: 'Nama target', goalNamePlaceholder: 'Dana darurat',
    goalTarget: 'Jumlah target', goalDate: 'Tanggal target (opsional)',
    back: 'Kembali', next: 'Lanjut', finish: 'Ke dasbor saya', saving: 'Menyimpan…',
    quickAdd: 'Tambah cepat', amount: 'Jumlah', category: 'Kategori', account: 'Dompet', note: 'Catatan (opsional)',
    moreOptions: 'Dompet dan catatan', save: 'Simpan', saved: 'Tersimpan.', useSuggestion: 'Gunakan saran',
    lastUsed: 'Terakhir dipakai', chooseCategory: 'Pilih kategori untuk selesai.',
    appearance: 'Tampilan', appearanceIntro: 'Tema dan bahasa berlaku di semua perangkat.',
    theme: 'Tema', themeLight: 'Terang', themeDark: 'Gelap', themeSystem: 'Ikuti perangkat',
    offlineQueued: 'Anda sedang luring. Perubahan tidak dapat disimpan.',
    retry: 'Coba lagi', errorTitle: 'Terjadi kesalahan', loading: 'Memuat…', cancel: 'Batal', typeLabel: 'Jenis'
  }
} as const;

export function uxText(locale: Locale, key: keyof typeof messages.en) {
  return messages[locale][key];
}
