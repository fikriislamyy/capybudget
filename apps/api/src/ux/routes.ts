import { Elysia } from 'elysia';
import type { TransactionSql } from 'postgres';
import { auth } from '../auth';
import { client } from '../db';
import { seedWorkspace } from '../tracking/routes';
import { DEFAULT_PREFERENCES, isStepAdvance, parseOnboardingProgress, parsePreferences, parseProvision, type OnboardingStep } from './validate';
import { supportedCurrencies } from './currencies';
import { supportedTimezones } from './timezones';

type Actor = { id: string; name: string };
const q = (tx: TransactionSql, text: string, values: unknown[] = []) => tx.unsafe(text, values as never[]);

function fail(status: number, code: string, message: string) {
  return Response.json({ code, message }, { status, headers: { 'Cache-Control': 'no-store' } });
}

async function actorFor(request: Request): Promise<Actor | Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return fail(401, 'AUTH_REQUIRED', 'Sign in to continue.');
  if (!session.user.emailVerified) return fail(403, 'EMAIL_VERIFICATION_REQUIRED', 'Verify your email to continue.');
  return { id: session.user.id, name: session.user.name };
}

function prefsJson(row: Record<string, unknown> | undefined) {
  return {
    theme: (row?.theme as string) ?? DEFAULT_PREFERENCES.theme,
    locale: (row?.locale as string) ?? DEFAULT_PREFERENCES.locale,
    customized: Boolean(row?.customized ?? DEFAULT_PREFERENCES.customized)
  };
}

function onboardingJson(row: Record<string, unknown> | undefined) {
  return {
    usageType: (row?.usage_type as string) ?? null,
    currency: (row?.currency as string) ?? 'IDR',
    language: (row?.language as string) ?? 'en',
    currentStep: (row?.current_step as string) ?? 'usage',
    firstWorkspaceId: (row?.first_workspace_id as string) ?? null,
    completed: Boolean(row?.completed_at)
  };
}

export const uxRoutes = new Elysia()
  .get('/api/currencies', async ({ request }) => {
    const actor = await actorFor(request);
    if (actor instanceof Response) return actor;
    return Response.json(await supportedCurrencies(), { headers: { 'Cache-Control': 'no-store' } });
  })
  .get('/api/timezones', async ({ request }) => {
    const actor = await actorFor(request);
    if (actor instanceof Response) return actor;
    return Response.json(await supportedTimezones(), { headers: { 'Cache-Control': 'no-store' } });
  })
  .get('/api/preferences', async ({ request }) => {
    const actor = await actorFor(request);
    if (actor instanceof Response) return actor;
    return client.begin(async (tx) => {
      await tx.unsafe("select set_config('app.user_id',$1,true)", [actor.id]);
      const [row] = await q(tx, 'select theme,locale,customized from user_preferences where user_id=$1', [actor.id]);
      return Response.json(prefsJson(row), { headers: { 'Cache-Control': 'no-store' } });
    });
  })
  .put('/api/preferences', async ({ request }) => {
    const actor = await actorFor(request);
    if (actor instanceof Response) return actor;
    let parsed;
    try {
      parsed = parsePreferences(await request.json().catch(() => ({})));
    } catch (e) {
      return fail(422, 'INVALID_INPUT', e instanceof Error ? e.message : 'Invalid preferences.');
    }
    return client.begin(async (tx) => {
      await tx.unsafe("select set_config('app.user_id',$1,true)", [actor.id]);
      const [row] = await q(tx,
        'insert into user_preferences(user_id,theme,locale,customized,updated_at) values($1,$2,$3,true,now()) on conflict(user_id) do update set theme=$2,locale=$3,customized=true,updated_at=now() returning theme,locale,customized',
        [actor.id, parsed.theme, parsed.locale]
      );
      return Response.json(prefsJson(row), { headers: { 'Cache-Control': 'no-store' } });
    });
  })
  .get('/api/onboarding', async ({ request }) => {
    const actor = await actorFor(request);
    if (actor instanceof Response) return actor;
    return client.begin(async (tx) => {
      await tx.unsafe("select set_config('app.user_id',$1,true)", [actor.id]);
      const [row] = await q(tx, 'select usage_type,currency,language,current_step,first_workspace_id,completed_at from onboarding_state where user_id=$1', [actor.id]);
      return Response.json(onboardingJson(row), { headers: { 'Cache-Control': 'no-store' } });
    });
  })
  .put('/api/onboarding', async ({ request }) => {
    const actor = await actorFor(request);
    if (actor instanceof Response) return actor;
    let parsed;
    try {
      parsed = parseOnboardingProgress(await request.json().catch(() => ({})));
    } catch (e) {
      return fail(422, 'INVALID_INPUT', e instanceof Error ? e.message : 'Invalid onboarding data.');
    }
    return client.begin(async (tx) => {
      await tx.unsafe("select set_config('app.user_id',$1,true)", [actor.id]);
      const [existing] = await q(tx, 'select current_step,completed_at from onboarding_state where user_id=$1 for update', [actor.id]);
      if (existing?.completed_at) return fail(409, 'ONBOARDING_COMPLETE', 'Onboarding is already complete.');
      const current = (existing?.current_step as OnboardingStep) ?? 'usage';
      if (parsed.currentStep && !isStepAdvance(current, parsed.currentStep)) return fail(422, 'INVALID_STEP', 'Finish the current step first.');
      const [row] = await q(tx,
        `insert into onboarding_state(user_id,usage_type,currency,language,current_step,updated_at) values($1,$2,$3,$4,$5,now())
         on conflict(user_id) do update set usage_type=coalesce($2,onboarding_state.usage_type),currency=coalesce($3,onboarding_state.currency),language=coalesce($4,onboarding_state.language),current_step=coalesce($5,onboarding_state.current_step),updated_at=now()
         returning usage_type,currency,language,current_step,first_workspace_id,completed_at`,
        [actor.id, parsed.usageType ?? null, parsed.currency ?? null, parsed.language ?? null, parsed.currentStep ?? null]);
      return Response.json(onboardingJson(row), { headers: { 'Cache-Control': 'no-store' } });
    });
  })
  .post('/api/onboarding/provision', async ({ request }) => {
    const actor = await actorFor(request);
    if (actor instanceof Response) return actor;
    let parsed;
    try {
      parsed = parseProvision(await request.json().catch(() => ({})));
    } catch (e) {
      return fail(422, 'INVALID_INPUT', e instanceof Error ? e.message : 'Invalid onboarding data.');
    }
    try {
      return await client.begin(async (tx) => {
        await tx.unsafe("select set_config('app.user_id',$1,true),set_config('app.workspace_id','',true)", [actor.id]);
        const [state] = await q(tx, 'select completed_at from onboarding_state where user_id=$1 for update', [actor.id]);
        if (state?.completed_at) throw Object.assign(new Error('Onboarding is already complete.'), { status: 409, code: 'ONBOARDING_COMPLETE' });
        // Personal workspace for personal/both; business workspace for business/both.
        const wantPersonal = parsed.usageType !== 'business';
        const wantBusiness = parsed.usageType !== 'personal';
        let personal: Record<string, unknown> | undefined;
        let business: Record<string, unknown> | undefined;
        if (wantPersonal) {
          const [created] = await q(tx, "insert into workspaces(owner_user_id,name,kind,currency) values($1,'Personal','personal',$2) on conflict(owner_user_id) where kind='personal' do nothing returning id,name,kind,currency,timezone", [actor.id, parsed.currency]);
          const [w] = created ? [created] : await q(tx, "select id,name,kind,currency,timezone from workspaces where owner_user_id=$1 and kind='personal' and archived_at is null", [actor.id]);
          personal = w;
          await q(tx, 'insert into workspace_memberships(workspace_id,user_id,role) values($1,$2,\'owner\') on conflict do nothing', [w.id, actor.id]);
          await tx.unsafe("select set_config('app.workspace_id',$1,true)", [String(w.id)]);
          // Fresh workspace (no accounts yet) adopts the chosen currency, including its seed ledger.
          await q(tx, 'update workspaces set currency=$2,updated_at=now() where id=$1 and not exists(select 1 from accounts where workspace_id=$1)', [w.id, parsed.currency]);
          await q(tx, 'update ledger_accounts set currency=$2 where workspace_id=$1 and not exists(select 1 from journal_lines jl where jl.workspace_id=$1 and jl.ledger_account_id=ledger_accounts.id)', [w.id, parsed.currency]);
          await seedWorkspace(tx, String(w.id), parsed.currency);
        }
        if (wantBusiness) {
          const existing = await q(tx, "select id,name,kind,currency,timezone from workspaces where owner_user_id=$1 and kind='business' and archived_at is null order by created_at limit 1", [actor.id]);
          if (existing.length) {
            business = existing[0];
            await tx.unsafe("select set_config('app.workspace_id',$1,true)", [String(business.id)]);
            await q(tx, 'update workspaces set currency=$2,updated_at=now() where id=$1 and not exists(select 1 from accounts where workspace_id=$1)', [business.id, parsed.currency]);
            await q(tx, 'update ledger_accounts set currency=$2 where workspace_id=$1 and not exists(select 1 from journal_lines jl where jl.workspace_id=$1 and jl.ledger_account_id=ledger_accounts.id)', [business.id, parsed.currency]);
          } else {
            const [w] = await q(tx, 'insert into workspaces(owner_user_id,name,kind,currency) values($1,$2,\'business\',$3) returning id,name,kind,currency,timezone', [actor.id, parsed.businessName || 'Business', parsed.currency]);
            business = w;
            await q(tx, 'insert into workspace_memberships(workspace_id,user_id,role) values($1,$2,\'owner\')', [w.id, actor.id]);
            await tx.unsafe("select set_config('app.workspace_id',$1,true)", [String(w.id)]);
            await q(tx, 'insert into business_profiles(workspace_id,legal_name) values($1,$2) on conflict(workspace_id) do nothing', [w.id, parsed.businessName || 'Business']);
            await seedWorkspace(tx, String(w.id), parsed.currency);
          }
        }
        const firstId = String((personal ?? business)!.id);
        await q(tx,
          `insert into onboarding_state(user_id,usage_type,currency,language,current_step,first_workspace_id,updated_at) values($1,$2,$3,$4,'account',$5,now())
           on conflict(user_id) do update set usage_type=$2,currency=$3,language=$4,current_step='account',first_workspace_id=$5,updated_at=now()`,
          [actor.id, parsed.usageType, parsed.currency, parsed.language, firstId]);
        await q(tx,
          'insert into user_preferences(user_id,locale,customized,updated_at) values($1,$2,true,now()) on conflict(user_id) do update set locale=$2,customized=true,updated_at=now()',
          [actor.id, parsed.language]);
        const items = await q(tx, 'select w.id,w.name,w.kind,w.currency,w.timezone from workspaces w join workspace_memberships m on m.workspace_id=w.id where m.user_id=$1 and w.archived_at is null order by w.kind,w.created_at', [actor.id]);
        return Response.json({ workspaces: items, firstWorkspaceId: firstId }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
      });
    } catch (e) {
      const err = e as Error & { status?: number; code?: string };
      if (err.status) return fail(err.status, err.code ?? 'REQUEST_FAILED', err.message);
      console.error('Onboarding provision failed', { sqlState: err.code });
      return fail(500, 'INTERNAL_ERROR', 'The request could not be completed.');
    }
  })
  .post('/api/onboarding/finish', async ({ request }) => {
    const actor = await actorFor(request);
    if (actor instanceof Response) return actor;
    return client.begin(async (tx) => {
      await tx.unsafe("select set_config('app.user_id',$1,true)", [actor.id]);
      const [existing] = await q(tx, 'select usage_type,first_workspace_id,completed_at from onboarding_state where user_id=$1 for update', [actor.id]);
      if (existing?.completed_at) return fail(409, 'ONBOARDING_COMPLETE', 'Onboarding is already complete.');
      if (!existing?.usage_type || !existing?.first_workspace_id) return fail(422, 'ONBOARDING_INCOMPLETE', 'Finish the earlier steps first.');
      const [row] = await q(tx, "update onboarding_state set current_step='done',completed_at=now(),updated_at=now() where user_id=$1 returning usage_type,currency,language,current_step,first_workspace_id,completed_at", [actor.id]);
      return Response.json(onboardingJson(row), { headers: { 'Cache-Control': 'no-store' } });
    });
  });
