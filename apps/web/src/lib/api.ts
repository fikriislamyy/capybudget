import { treaty } from '@elysiajs/eden';
import { PUBLIC_API_URL } from '$env/static/public';
import type { App } from '@capybudget/api';

const apiUrl = PUBLIC_API_URL || 'http://localhost:3000';
export const api = treaty<App>(apiUrl, { fetch: { credentials: 'include' } });
