import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { renderEmail } from '../src/email/templates';
import type { EmailLocale, EmailMessage } from '../src/email/types';

// Fictional local previews only: no SMTP, database, or queue access.
process.env.BETTER_AUTH_URL = 'https://capybudget.example';
const output = '/tmp/capybudget-email-previews';
await mkdir(output, { recursive: true });
const links: string[] = [];

for (const locale of ['en', 'id'] satisfies EmailLocale[]) {
  const common = { to: 'preview@example.invalid', locale, expiresAt: Date.now() + 600_000 };
  const workspace = { workspaceId: 'preview', deliveryId: 'preview' };
  const samples: EmailMessage[] = [
    { ...common, kind: 'verification', otp: '246810' },
    { ...common, kind: 'password-reset', url: 'https://capybudget.example/reset-password?token=preview-only' },
    { ...common, ...workspace, kind: 'bill-reminder', userId: 'preview', occurrenceId: 'preview', billName: locale === 'id' ? 'Sewa rumah' : 'Rent', amount: '2000000', currency: 'IDR', dueDate: '2026-11-01' },
    { ...common, ...workspace, kind: 'invoice-delivery', requestedBy: 'preview', invoiceNumber: 'INV-021' },
    { ...common, ...workspace, kind: 'invoice-reminder', requestedBy: 'preview', invoiceNumber: 'INV-021', reminderMessage: locale === 'id' ? 'Halo,\nIni pengingat untuk faktur INV-021. Jika sudah dibayar, terima kasih!\nSilakan hubungi kami jika ada pertanyaan.' : 'Hello,\nA friendly reminder about invoice INV-021. If you’ve already paid, thank you!\nPlease get in touch if you have any questions.' },
    { ...common, ...workspace, kind: 'assistant-alert', userId: 'preview', notificationId: 'preview', title: locale === 'id' ? 'Sedikit ruang untuk tagihan mendatang' : 'A little room for your upcoming bills', message: locale === 'id' ? 'Saldo diperkirakan menipis setelah pembayaran sewa pada tanggal 1.\nMengapa? Gaji berikutnya masuk tanggal 5. Tinjau perkiraan sebelum menentukan langkah.' : 'Your balance may be tight after rent on the 1st.\nWhy? Your next payday is on the 5th. Review the forecast before deciding your next step.' },
  ];
  for (const sample of samples) {
    const rendered = renderEmail(sample);
    const name = `${sample.kind}-${locale}`;
    await Bun.write(join(output, `${name}.html`), rendered.html);
    await Bun.write(join(output, `${name}.txt`), `${rendered.subject}\n\n${rendered.text}`);
    links.push(`<li><a href="${name}.html">${name}</a> · <a href="${name}.txt">Plain text</a></li>`);
  }
}

await Bun.write(join(output, 'index.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CapyBudget email previews</title><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500&family=Nunito:wght@400;700&display=swap"><style>body{font-family:'Nunito','Trebuchet MS',sans-serif}h1{font-family:'Fredoka','Trebuchet MS',sans-serif;font-weight:500;color:#8A5F3A}a{display:inline-block;padding:8px;color:#1F7A96}a:focus-visible{outline:3px solid #1F7A96;outline-offset:4px}li{margin-bottom:8px}</style></head><body style="background:#FFF8EC;color:#3B2A1E;line-height:1.6;padding:24px"><h1>CapyBudget email previews</h1><p>Fictional sample data. No emails were sent. Set your browser to dark mode to preview Night Pond.</p><ul>${links.join('')}</ul></body></html>`);
console.log(`Email previews saved to ${output}/index.html (no emails sent).`);
