export type Locale = 'en' | 'id';

export const messages = {
  en: {
    brand: 'CapyBudget', tagline: 'A calmer way to care for your money.',
    loginTitle: 'Welcome back', loginDescription: 'Sign in to continue to your budget.',
    signupTitle: 'Create your account', signupDescription: 'Start building a clearer picture of your money.',
    name: 'Name', email: 'Email address', password: 'Password', confirmPassword: 'Confirm password',
    login: 'Sign in', signup: 'Create account', forgot: 'Forgot password?', noAccount: 'New to CapyBudget?', haveAccount: 'Already have an account?',
    createAccount: 'Sign up', signIn: 'Sign in', verifyTitle: 'Check your inbox', verifyDescription: 'Enter the 6-digit code we sent to your email.',
    verify: 'Verify email', resend: 'Resend code', code: 'Verification code',
    forgotTitle: 'Reset your password', forgotDescription: 'We’ll email you a link to choose a new password.', sendLink: 'Send reset link',
    resetTitle: 'Choose a new password', resetDescription: 'Use at least 12 characters for your new password.', reset: 'Update password',
    dashboard: 'Your account is ready', signOut: 'Sign out', language: 'Bahasa Indonesia',
    genericError: 'We couldn’t complete that request. Please try again.', sent: 'If an account matches that email, instructions are on the way.',
    rateLimited: 'Too many attempts. Try again in {seconds}s.',
    verificationSent: 'A verification code has been sent.', resendWait: 'Resend in {seconds}s', verified: 'Email verified. You can now sign in.',
    passwordMismatch: 'Passwords do not match.', passwordLength: 'Use at least 12 characters.',
    unverified: 'Please verify your email before signing in.', backLogin: 'Back to sign in'
  },
  id: {
    brand: 'CapyBudget', tagline: 'Cara yang lebih tenang untuk mengelola uang.',
    loginTitle: 'Selamat datang kembali', loginDescription: 'Masuk untuk melanjutkan ke anggaran Anda.',
    signupTitle: 'Buat akun Anda', signupDescription: 'Mulai pahami kondisi keuangan Anda dengan lebih jelas.',
    name: 'Nama', email: 'Alamat email', password: 'Kata sandi', confirmPassword: 'Konfirmasi kata sandi',
    login: 'Masuk', signup: 'Buat akun', forgot: 'Lupa kata sandi?', noAccount: 'Belum punya akun?', haveAccount: 'Sudah punya akun?',
    createAccount: 'Daftar', signIn: 'Masuk', verifyTitle: 'Periksa email Anda', verifyDescription: 'Masukkan kode 6 digit yang kami kirim ke email Anda.',
    verify: 'Verifikasi email', resend: 'Kirim ulang kode', code: 'Kode verifikasi',
    forgotTitle: 'Atur ulang kata sandi', forgotDescription: 'Kami akan mengirim tautan untuk membuat kata sandi baru.', sendLink: 'Kirim tautan',
    resetTitle: 'Pilih kata sandi baru', resetDescription: 'Gunakan setidaknya 12 karakter.', reset: 'Perbarui kata sandi',
    dashboard: 'Akun Anda siap', signOut: 'Keluar', language: 'English',
    genericError: 'Permintaan belum berhasil. Silakan coba lagi.', sent: 'Jika email terdaftar, petunjuk akan segera dikirim.',
    rateLimited: 'Terlalu banyak percobaan. Coba lagi dalam {seconds} dtk.',
    verificationSent: 'Kode verifikasi telah dikirim.', resendWait: 'Kirim ulang dalam {seconds} dtk', verified: 'Email terverifikasi. Anda dapat masuk.',
    passwordMismatch: 'Kata sandi tidak sama.', passwordLength: 'Gunakan setidaknya 12 karakter.',
    unverified: 'Verifikasi email sebelum masuk.', backLogin: 'Kembali ke masuk'
  }
} as const;

export function getLocale(value?: string | null): Locale {
  return value?.toLowerCase().startsWith('id') ? 'id' : 'en';
}

export const AUTH_UI_CONTEXT = 'capybudget-auth-ui';
export type AuthUiState = { locale: Locale; dark: boolean };
