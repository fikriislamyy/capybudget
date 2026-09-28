import { treaty } from '@elysiajs/eden';
import { env } from '$env/dynamic/public';
import type { App } from '@capybudget/api';

const apiUrl = env.PUBLIC_API_URL || 'http://localhost:3000';
export const api = treaty<App>(apiUrl, { fetch: { credentials: 'include' } });
