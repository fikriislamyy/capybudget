import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { openapi } from '@elysiajs/openapi';
import { auth } from './auth';

const app = new Elysia()
  .use(cors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173', credentials: true }))
  .use(openapi())
  .all('/api/auth/*', ({ request }) => auth.handler(request))
  .get('/api/health', () => ({ status: 'ok' }), {
    detail: { summary: 'Health check', tags: ['System'] }
  })
  .get('/api', () => ({ name: 'CapyBudget API', version: '0.1.0' }))
  .listen(Number(process.env.PORT ?? 3000));

console.log(`CapyBudget API listening at ${app.server?.url}`);
export type App = typeof app;
