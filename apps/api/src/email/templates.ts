import type { EmailMessage } from './types';

const copy = {
  en: {
    verificationSubject: 'Your CapyBudget verification code',
    verificationTitle: 'Verify your email',
    verificationText: 'Enter this code in CapyBudget to verify your email address:',
    resetSubject: 'Reset your CapyBudget password',
    resetTitle: 'Reset your password',
    resetText: 'Use the link below to choose a new password:',
    expires: 'This message expires in 10 minutes.',
    resetExpires: 'This link expires in 30 minutes.',
    ignore: "If you didn't request this, you can safely ignore this email."
  },
  id: {
    verificationSubject: 'Kode verifikasi CapyBudget',
    verificationTitle: 'Verifikasi email Anda',
    verificationText: 'Masukkan kode ini di CapyBudget untuk memverifikasi alamat email Anda:',
    resetSubject: 'Atur ulang kata sandi CapyBudget',
    resetTitle: 'Atur ulang kata sandi',
    resetText: 'Gunakan tautan berikut untuk membuat kata sandi baru:',
    expires: 'Kode ini berlaku selama 10 menit.',
    resetExpires: 'Tautan ini berlaku selama 30 menit.',
    ignore: 'Jika Anda tidak meminta ini, abaikan email ini.'
  }
} as const;

function escapeHtml(value: string): string {
  const escaped: Record<string, string> = {
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  };
  return value.replace(/[&<>"']/g, (character) => escaped[character]!);
}

export function renderEmail(message: EmailMessage) {
  const words = copy[message.locale];

  if (message.kind === 'verification') {
    const otp = escapeHtml(message.otp);
    return {
      subject: words.verificationSubject,
      text: [words.verificationTitle, '', words.verificationText, '', message.otp, '', words.expires, words.ignore].join('\n'),
      html: '<main><h1>' + words.verificationTitle + '</h1><p>' + words.verificationText +
        '</p><p style="font-size:32px;font-weight:700;letter-spacing:8px">' + otp +
        '</p><p>' + words.expires + '</p><p>' + words.ignore + '</p></main>'
    };
  }

  const url = escapeHtml(message.url);
  return {
    subject: words.resetSubject,
    text: [words.resetTitle, '', words.resetText, '', message.url, '', words.resetExpires, words.ignore].join('\n'),
    html: '<main><h1>' + words.resetTitle + '</h1><p>' + words.resetText +
      '</p><p><a href="' + url + '">' + words.resetText + '</a></p><p>' +
      words.resetExpires + '</p><p>' + words.ignore + '</p></main>'
  };
}
