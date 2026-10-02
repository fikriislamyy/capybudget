# CapyBudget email design

All six outgoing email types use `apps/api/src/email/layout.ts`: email verification, password reset, bill reminder, invoice delivery, invoice reminder, and AI cashflow alert. Copy and content live in `templates.ts`, in English and Indonesian.

The shared layout mirrors the app's `tokens.css`: cream background, warm brown headings, sand detail cards, 20px card radius, 14px inset cards, 2px warm borders, and pill actions. OTPs have a pond-blue inset card. Business emails keep a simple wordmark and invoice reference, without mascot illustrations. Buttons use the app's bark text on fur fill for readable contrast.

Emails use presentation tables and inline CSS for a readable baseline when clients strip styles. Responsive padding and Night Pond colors enhance clients that support media queries. Fredoka and Nunito load where web fonts are allowed; Trebuchet MS and Arial remain usable fallbacks. Some clients override dark colors or render square corners. No JavaScript, animation, external images, or additional email libraries are required.

All dynamic content is HTML escaped; reminder line breaks are retained. Verification codes and financial details are excluded from custom inbox preheaders. Password reset emails retain the original reset URL and include a copyable fallback. Bill and AI actions link to existing app routes through `BETTER_AUTH_URL`. Invoice attachments and delivery jobs are unchanged. Each email retains a plain-text alternative.

## Local previews

From the repository root:

```sh
bun run --cwd apps/api email:preview
```

Open `/tmp/capybudget-email-previews/index.html` to view all six types in both languages and their plain-text alternatives. These contain fictional data and example links. The preview command does not send mail or access the database or queue. Use browser dark mode to see the Night Pond treatment.

Real inbox appearance still needs a review in the email clients used by your recipients; browser previews do not reproduce every client restriction.
