import { formatDate, formatDateTime, formatDatesInText } from '../../../../shared/dates';
import type { EmailMessage } from './types';
import { appLink, codeCard, detailCard, emailLayout, paragraph } from './layout';

const copy = {
  en: {
    verificationSubject: 'Your CapyBudget verification code',
    verificationTitle: 'A little check, then you’re in',
    verificationText: 'Enter this code in CapyBudget to verify your email address.',
    codeLabel: 'Your verification code',
    resetSubject: 'Reset your CapyBudget password',
    resetTitle: 'Let’s get you back in',
    resetText: 'Choose a new password to get back to your money pond.',
    resetAction: 'Reset password',
    expires: 'This code expires in 10 minutes. Keep it to yourself.',
    resetExpires: 'This link expires in 30 minutes.',
    ignore: 'If you didn’t request this, you can safely ignore this email.',
    fallback: 'Button not working? Copy this link into your browser:',
    security: 'ACCOUNT SECURITY', business: 'BUSINESS', personal: 'YOUR MONEY', assistant: 'A NOTE FROM CAPY',
    invoiceSubject: 'Your invoice from CapyBudget',
    invoiceTitle: 'Your invoice is ready',
    invoiceText: 'Your invoice is attached as a PDF. You can download it to review the details or keep a copy for your records.',
    invoiceLabel: 'Invoice number',
    paymentAction:'Pay with QRIS', paymentIntro:'Open your payment page to review the total and pay with QRIS. No CapyBudget login is needed.',
    paymentExpiry:'Payment link valid until', paymentSandbox:'Sandbox test payment only. Do not send real money.',
    paymentLinkSubject:'Your invoice payment link', paymentLinkTitle:'Here’s your payment link',
    invoiceReminderSubject: 'A payment reminder for your invoice',
    invoiceReminderTitle: 'A friendly payment reminder',
    billSubject: 'A bill is coming up · CapyBudget', billTitle: 'A little heads-up for your bill',
    billIntro: 'Here’s what’s coming up, so you can leave a little room for it.',
    billLabel: 'Bill', amountLabel: 'Amount', dueLabel: 'Due date', billAction: 'Review your bills',
    assistantAlertSubject: 'A cashflow update · CapyBudget',
    assistantAlertOpen: 'Open CapyBudget to review the details and decide what works for you.',
    assistantAction: 'Review cashflow',
    assistantNote: 'Capy’s suggestions are not professional financial advice. Capy never moves money without your approval.',
  },
  id: {
    verificationSubject: 'Kode verifikasi CapyBudget',
    verificationTitle: 'Satu langkah lagi, lalu siap',
    verificationText: 'Masukkan kode ini di CapyBudget untuk memverifikasi alamat email Anda.',
    codeLabel: 'Kode verifikasi Anda',
    resetSubject: 'Atur ulang kata sandi CapyBudget',
    resetTitle: 'Mari masuk kembali',
    resetText: 'Buat kata sandi baru untuk kembali mengelola uang dengan tenang.',
    resetAction: 'Atur ulang kata sandi',
    expires: 'Kode ini berlaku selama 10 menit. Jangan bagikan kepada siapa pun.',
    resetExpires: 'Tautan ini berlaku selama 30 menit.',
    ignore: 'Jika Anda tidak meminta ini, Anda dapat mengabaikan email ini.',
    fallback: 'Tombol tidak berfungsi? Salin tautan ini ke browser Anda:',
    security: 'KEAMANAN AKUN', business: 'BISNIS', personal: 'KEUANGAN ANDA', assistant: 'CATATAN DARI CAPY',
    invoiceSubject: 'Faktur dari CapyBudget',
    invoiceTitle: 'Faktur Anda sudah siap',
    invoiceText: 'Faktur Anda terlampir sebagai PDF. Unduh untuk meninjau detailnya atau simpan sebagai arsip.',
    invoiceLabel: 'Nomor faktur',
    paymentAction:'Bayar dengan QRIS', paymentIntro:'Buka halaman pembayaran untuk melihat total dan membayar dengan QRIS. Tidak perlu masuk ke akun CapyBudget.',
    paymentExpiry:'Tautan pembayaran berlaku sampai', paymentSandbox:'Pembayaran uji sandbox saja. Jangan kirim uang sungguhan.',
    paymentLinkSubject:'Tautan pembayaran faktur Anda', paymentLinkTitle:'Ini tautan pembayaran Anda',
    invoiceReminderSubject: 'Pengingat pembayaran faktur Anda',
    invoiceReminderTitle: 'Pengingat pembayaran',
    billSubject: 'Tagihan akan jatuh tempo · CapyBudget', billTitle: 'Pengingat kecil untuk tagihan Anda',
    billIntro: 'Ini tagihan yang akan datang, agar Anda bisa menyiapkan ruang untuknya.',
    billLabel: 'Tagihan', amountLabel: 'Jumlah', dueLabel: 'Tanggal jatuh tempo', billAction: 'Lihat tagihan Anda',
    assistantAlertSubject: 'Pembaruan arus kas · CapyBudget',
    assistantAlertOpen: 'Buka CapyBudget untuk meninjau detailnya dan menentukan langkah yang cocok untuk Anda.',
    assistantAction: 'Tinjau arus kas',
    assistantNote: 'Saran Capy bukan nasihat keuangan profesional. Capy tidak pernah memindahkan uang tanpa persetujuan Anda.',
  },
} as const;

export function renderEmail(message: EmailMessage) {
  const words = copy[message.locale];
  const base = { locale: message.locale };

  switch (message.kind) {
    case 'business-invitation': {
      const id = message.locale === 'id';
      const title = id ? 'Anda diundang bergabung ke tim' : 'You’re invited to join the team';
      const intro = id ? `Bergabung ke ${message.businessName} sebagai ${message.role}. Buat akun dengan email ini, verifikasi, lalu terima undangannya. Sudah punya akun? Masuk dengan email yang sama.` : `Join ${message.businessName} as ${message.role}. Create an account with this email, verify it, then accept your invitation. Already have an account? Sign in with the same email.`;
      const expiry = (id ? 'Undangan berlaku sampai ' : 'Invitation valid until ') + formatDateTime(new Date(message.expiresAt).toISOString());
      return { subject: title + ' · CapyBudget', text: [title,intro,message.url,expiry,words.ignore].join('\n\n'),
        html: emailLayout({...base,title,category:words.business,preheader:intro,
          content:paragraph(intro)+detailCard([{label:id?'Bisnis':'Business',value:message.businessName},{label:'Email',value:message.to}])+paragraph(expiry,true)+paragraph(words.ignore,true),
          action:{label:id?'Bergabung ke tim':'Join the team',url:message.url},fallbackLabel:words.fallback}) };
    }
    case 'verification':
      return {
        subject: words.verificationSubject,
        text: [words.verificationTitle, '', words.verificationText, '', message.otp, '', words.expires, words.ignore].join('\n'),
        html: emailLayout({ ...base, title: words.verificationTitle, category: words.security,
          preheader: words.verificationText,
          content: paragraph(words.verificationText) + codeCard(message.otp, words.codeLabel) + paragraph(words.expires, true) + paragraph(words.ignore, true) }),
      };
    case 'password-reset':
      return {
        subject: words.resetSubject,
        text: [words.resetTitle, '', words.resetText, '', message.url, '', words.resetExpires, words.ignore].join('\n'),
        html: emailLayout({ ...base, title: words.resetTitle, category: words.security,
          preheader: words.resetText,
          content: paragraph(words.resetText) + paragraph(words.resetExpires, true) + paragraph(words.ignore, true),
          action: { label: words.resetAction, url: message.url }, fallbackLabel: words.fallback }),
      };
    case 'bill-reminder': {
      const url = appLink('/bills');
      const amount = `${message.currency} ${message.amount}`;
      return {
        subject: words.billSubject,
        text: [words.billTitle, '', words.billIntro, '', `${words.billLabel}: ${message.billName}`, `${words.amountLabel}: ${amount}`, `${words.dueLabel}: ${formatDate(message.dueDate)}`, '', words.billAction, url].join('\n'),
        html: emailLayout({ ...base, title: words.billTitle, category: words.personal,
          preheader: words.billIntro,
          content: paragraph(words.billIntro) + detailCard([{ label: words.billLabel, value: message.billName }, { label: words.amountLabel, value: amount }, { label: words.dueLabel, value: formatDate(message.dueDate) }]),
          action: { label: words.billAction, url } }),
      };
    }
    case 'invoice-delivery': {
      const note=message.paymentUrl?words.paymentIntro:'';
      const sandbox=message.paymentUrl&&message.paymentSandbox?words.paymentSandbox:'';
      const expiry=message.paymentUrl&&message.paymentExpiresAt?`${words.paymentExpiry}: ${formatDateTime(message.paymentExpiresAt,message.locale)}`:'';
      return {
        subject: `${words.invoiceSubject} · ${message.invoiceNumber}`,
        text: [words.invoiceTitle, '', words.invoiceText, '', `${words.invoiceLabel}: ${message.invoiceNumber}`,note,sandbox,expiry,message.paymentUrl??''].filter(Boolean).join('\n'),
        html: emailLayout({ ...base, title: words.invoiceTitle, category: words.business,
          preheader: words.invoiceText,
          content: paragraph(words.invoiceText) + detailCard([{ label: words.invoiceLabel, value: message.invoiceNumber }])+(note?paragraph(note):'')+(sandbox?paragraph(sandbox):'')+(expiry?paragraph(expiry,true):''),
          ...(message.paymentUrl?{action:{label:words.paymentAction,url:message.paymentUrl},fallbackLabel:words.fallback}:{}) }),
      };
    }
    case 'invoice-reminder': {
      const title=message.paymentLinkOnly?words.paymentLinkTitle:words.invoiceReminderTitle;
      const sandbox=message.paymentUrl&&message.paymentSandbox?words.paymentSandbox:'';
      const expiry=message.paymentUrl&&message.paymentExpiresAt?`${words.paymentExpiry}: ${formatDateTime(message.paymentExpiresAt,message.locale)}`:'';
      return {
        subject: `${message.paymentLinkOnly?words.paymentLinkSubject:words.invoiceReminderSubject} · ${message.invoiceNumber}`,
        text: [title, '', formatDatesInText(message.reminderMessage), '', `${words.invoiceLabel}: ${message.invoiceNumber}`,sandbox,expiry,message.paymentUrl??''].filter(Boolean).join('\n'),
        html: emailLayout({ ...base, title, category: words.business,
          preheader: title,
          content: paragraph(formatDatesInText(message.reminderMessage)) + detailCard([{ label: words.invoiceLabel, value: message.invoiceNumber }])+(sandbox?paragraph(sandbox):'')+(expiry?paragraph(expiry,true):''),
          ...(message.paymentUrl?{action:{label:words.paymentAction,url:message.paymentUrl},fallbackLabel:words.fallback}:{}) }),
      };
    }
    case 'assistant-summary':
    case 'assistant-alert': {
      const url = appLink('/assistant');
      return {
        subject: words.assistantAlertSubject,
        text: [message.title, '', formatDatesInText(message.message), '', words.assistantAlertOpen, url, '', words.assistantNote].join('\n'),
        html: emailLayout({ ...base, title: message.title, category: words.assistant,
          preheader: words.assistantAlertOpen,
          content: paragraph(formatDatesInText(message.message)) + paragraph(words.assistantAlertOpen) + paragraph(words.assistantNote, true),
          action: { label: words.assistantAction, url } }),
      };
    }
  }
}
