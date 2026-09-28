import nodemailer, { type Transporter } from 'nodemailer';
import type { EmailMessage } from './types';
import { renderEmail } from './templates';

let transporter: Transporter | undefined;

function getTransporter(): Transporter {
  if (transporter) return transporter;
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 1025);
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('SMTP_HOST and a valid SMTP_PORT are required');
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: process.env.SMTP_SECURE === 'true',
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
    ...(process.env.SMTP_USER ? {
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD ?? '' }
    } : {})
  });
  return transporter;
}

export async function sendEmail(message: EmailMessage): Promise<void> {
  const from = process.env.EMAIL_FROM;
  if (!from) throw new Error('EMAIL_FROM is required');
  await getTransporter().sendMail({ from, to: message.to, ...renderEmail(message) });
}
