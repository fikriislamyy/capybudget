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
    ,invoiceSubject: 'Your invoice from CapyBudget', invoiceText: 'Please find your invoice attached.', billSubject: 'A bill is coming up · CapyBudget', billTitle: 'A bill is coming up', billText: 'is due on',
    billIntro: 'A gentle reminder for your upcoming bill:',
    invoiceTextShort: 'Invoice',
    invoiceReminderSubject: 'A payment reminder for your invoice',
    assistantAlertSubject: 'A cashflow update · CapyBudget', assistantAlertOpen: 'Open CapyBudget to review your cashflow update.',
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
    ignore: 'Jika Anda tidak meminta ini, abaikan email ini.',
    billSubject: 'Tagihan akan jatuh tempo · CapyBudget', billTitle: 'Tagihan akan jatuh tempo', billText: 'jatuh tempo pada',
    invoiceSubject: 'Faktur dari CapyBudget', invoiceText: 'Terlampir faktur Anda.', invoiceTextShort: 'Faktur',
    billIntro: 'Pengingat untuk tagihan Anda yang akan datang:'
    ,invoiceReminderSubject: 'Pengingat pembayaran faktur Anda', assistantAlertSubject: 'Pembaruan arus kas · CapyBudget', assistantAlertOpen: 'Buka CapyBudget untuk meninjau pembaruan arus kas Anda.'
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

  if(message.kind==='assistant-alert'){
    const title=escapeHtml(message.title),body=escapeHtml(message.message),open=escapeHtml(words.assistantAlertOpen);
    return {subject:words.assistantAlertSubject,text:`${message.title}\n\n${message.message}\n\n${words.assistantAlertOpen}`,html:`<main><h1>${title}</h1><p>${body}</p><p>${open}</p></main>`};
  }

  if (message.kind === 'invoice-delivery') {
    const number=escapeHtml(message.invoiceNumber),title=escapeHtml(words.invoiceSubject),intro=escapeHtml(words.invoiceText);
    return {subject:words.invoiceSubject+' · '+message.invoiceNumber,text:title+'\n\n'+intro+'\n'+words.invoiceTextShort+' '+message.invoiceNumber,
      html:'<main><h1>'+title+'</h1><p>'+intro+'</p><p><strong>'+words.invoiceTextShort+' '+number+'</strong></p></main>'};
  }
  if(message.kind==='invoice-reminder'){
    const number=escapeHtml(message.invoiceNumber),body=escapeHtml(message.reminderMessage),title=escapeHtml(words.invoiceReminderSubject);
    return {subject:`${words.invoiceReminderSubject} · ${message.invoiceNumber}`,text:`${title}\n\n${body}\n${words.invoiceTextShort} ${message.invoiceNumber}`,html:`<main><h1>${title}</h1><p>${body}</p><p><strong>${words.invoiceTextShort} ${number}</strong></p></main>`};
  }
  if (message.kind === 'bill-reminder') {
    const name = escapeHtml(message.billName), amount = escapeHtml(`${message.currency} ${message.amount}`), due = escapeHtml(message.dueDate);
    return { subject: words.billSubject, text: `${words.billTitle}\n\n${words.billIntro}\n${message.billName} · ${message.currency} ${message.amount} · ${words.billText} ${message.dueDate}.`,
      html: `<main><h1>${words.billTitle}</h1><p>${words.billIntro}</p><p><strong>${name}</strong><br>${amount}<br>${words.billText} ${due}</p></main>` };
  }

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
