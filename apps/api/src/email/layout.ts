import type { EmailLocale } from './types';

// Email clients need literal inline colors; mirror apps/web/src/tokens.css here.
const theme = {
  cream: '#FFF8EC', sand: '#F3E6CF', card: '#FFFDF7', fur: '#B98B5E',
  heading: '#8A5F3A', text: '#3B2A1E', muted: '#705E4F', border: '#E6D5B8',
  pond: '#E4F1F2', blue: '#1F7A96',
  bodyFont: "'Nunito', 'Trebuchet MS', Arial, sans-serif",
  headingFont: "'Fredoka', 'Trebuchet MS', Arial, sans-serif",
} as const;

export function escapeHtml(value: string): string {
  const escaped: Record<string, string> = {
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  };
  return value.replace(/[&<>"']/g, (character) => escaped[character]!);
}

export function paragraph(value: string, muted = false): string {
  return `<p class="${muted ? 'email-muted' : 'email-text'}" style="margin:0 0 16px;color:${muted ? theme.muted : theme.text};font-size:${muted ? 14 : 16}px;line-height:1.6;overflow-wrap:anywhere">${escapeHtml(value).replace(/\r\n|\r|\n/g, '<br>')}</p>`;
}

export function detailCard(rows: { label: string; value: string }[]): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="email-detail" style="width:100%;margin:0 0 24px;background:${theme.sand};border:2px solid ${theme.border};border-radius:14px"><tr><td style="padding:16px 20px">${rows.map(({ label, value }) => `<p class="email-muted" style="margin:0 0 4px;color:${theme.muted};font-size:14px;line-height:1.5">${escapeHtml(label)}</p><p class="email-text" style="margin:0 0 12px;color:${theme.text};font-size:18px;font-weight:700;line-height:1.5;overflow-wrap:anywhere;font-variant-numeric:tabular-nums">${escapeHtml(value)}</p>`).join('')}</td></tr></table>`;
}

export function codeCard(otp: string, label: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="email-code" style="width:100%;margin:8px 0 24px;background:${theme.pond};border:2px solid ${theme.border};border-radius:14px"><tr><td align="center" style="padding:24px 12px"><p class="email-muted" style="margin:0 0 8px;color:${theme.muted};font-size:14px;line-height:1.5">${escapeHtml(label)}</p><p class="email-code-value" style="margin:0;color:${theme.blue};font-family:${theme.bodyFont};font-size:32px;line-height:1.5;font-weight:800;letter-spacing:6px;font-variant-numeric:tabular-nums">${escapeHtml(otp)}</p></td></tr></table>`;
}

export function appLink(path: string): string {
  try {
    const base = new URL(process.env.BETTER_AUTH_URL ?? 'http://localhost:5173');
    if (!['https:', 'http:'].includes(base.protocol)) throw new Error('Invalid app URL');
    return new URL(path, base.origin).href;
  } catch {
    return new URL(path, 'http://localhost:5173').href;
  }
}

type EmailLayout = {
  locale: EmailLocale;
  title: string;
  preheader: string;
  category: string;
  content: string;
  action?: { label: string; url: string };
  fallbackLabel?: string;
};

export function emailLayout({ locale, title, preheader, category, content, action, fallbackLabel }: EmailLayout): string {
  const tagline = locale === 'id' ? 'Lebih tenang dengan uang Anda.' : 'Stay chill with your money.';
  const footer = locale === 'id' ? 'Email ini dikirim oleh CapyBudget.' : 'This email was sent by CapyBudget.';
  // Only HTTP(S) links can become actions. Escaping also protects attribute boundaries.
  let actionHtml = '';
  if (action) {
    const url = new URL(action.url);
    if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Email actions require an HTTP(S) URL');
    const href = escapeHtml(action.url);
    actionHtml = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px"><tr><td bgcolor="${theme.fur}" style="background:${theme.fur};border-radius:9999px;mso-padding-alt:14px 24px"><a class="email-button" href="${href}" style="display:inline-block;padding:14px 24px;min-height:20px;background:${theme.fur};border:2px solid ${theme.fur};border-radius:9999px;color:${theme.text};font-size:16px;line-height:20px;font-weight:800;text-align:center;text-decoration:none">${escapeHtml(action.label)}</a></td></tr></table>`;
    if (fallbackLabel) actionHtml += `${paragraph(fallbackLabel, true)}<p style="margin:0 0 24px;font-size:14px;line-height:1.6;word-break:break-all"><a class="email-link" href="${href}" style="color:${theme.blue};text-decoration:underline">${href}</a></p>`;
  }
  return `<!doctype html>
<html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${escapeHtml(title)} · CapyBudget</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600&family=Nunito:wght@400;600;700;800&display=swap');
  a:focus-visible{outline:3px solid ${theme.blue};outline-offset:4px}
  @media only screen and (max-width:600px){.email-outer{padding:16px 8px!important}.email-content{padding:24px 20px!important}.email-header{padding:24px 20px 16px!important}.email-title{font-size:26px!important}.email-button{display:block!important}}
  @media(prefers-color-scheme:dark){
    .email-bg{background:#2A211B!important}.email-card{background:#372C24!important;border-color:#68513A!important}.email-detail{background:#443729!important;border-color:#68513A!important}.email-code{background:#263B3D!important;border-color:#68513A!important}
    .email-text{color:#FFF1DC!important}.email-muted{color:#D6C4AB!important}.email-title,.email-brand{color:#D9B98A!important}.email-link,.email-code-value{color:#8BD0E2!important}
  }
</style></head>
<body class="email-bg" style="margin:0;padding:0;width:100%;background:${theme.cream};color:${theme.text};font-family:${theme.bodyFont};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="email-bg" bgcolor="${theme.cream}" style="width:100%;background:${theme.cream}"><tr><td class="email-outer" align="center" style="padding:32px 16px">
<!--[if mso]><table role="presentation" width="560" align="center"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="email-card" bgcolor="${theme.card}" style="width:100%;max-width:560px;background:${theme.card};border:2px solid ${theme.border};border-radius:20px;box-shadow:0 8px 24px rgba(138,95,58,0.05)">
<tr><td class="email-header" style="padding:32px 32px 20px"><p class="email-brand" style="margin:0;color:${theme.heading};font-family:${theme.headingFont};font-size:26px;font-weight:600;line-height:1.3">CapyBudget</p><p class="email-muted" style="margin:4px 0 0;color:${theme.muted};font-size:14px;line-height:1.5">${tagline}</p></td></tr>
<tr><td class="email-content" style="padding:8px 32px 32px"><p class="email-muted" style="margin:0 0 8px;color:${theme.muted};font-size:13px;font-weight:700;line-height:1.5;letter-spacing:1px">${escapeHtml(category)}</p><h1 class="email-title" style="margin:0 0 16px;color:${theme.heading};font-family:${theme.headingFont};font-size:30px;font-weight:500;line-height:1.25;overflow-wrap:anywhere">${escapeHtml(title)}</h1>${content}${actionHtml}</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px"><tr><td align="center" style="padding:24px 16px"><p class="email-muted" style="margin:0;color:${theme.muted};font-size:13px;line-height:1.6">${footer}<br>${tagline}</p></td></tr></table>
</td></tr></table></body></html>`;
}
