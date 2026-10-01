import { randomBytes, createHash, createHmac } from "node:crypto";
import { Elysia, t } from "elysia";
import { verifyPassword } from "better-auth/crypto";
import { auth } from "../auth";
import { client } from "../db";
import { consumeGrant, securityActor, SecurityError } from "./guards";
import { hashPin, unlockPin } from "./pin";
import {
  consumeAuthRateLimit,
  buildRateLimitBuckets,
} from "../auth/rate-limit";
import { webauthnOptions, webauthnVerify } from "./webauthn";

export const securityRoutes = new Elysia({ prefix: "/api/security" })
  .onBeforeHandle(async ({ request }) => {
    if (request.method === "GET") return;
    const a = await securityActor(request);
    const ip = request.headers.get("x-capybudget-trusted-ip") ?? "unknown";
    const ipDigest = createHmac("sha256", process.env.BETTER_AUTH_SECRET!)
      .update(ip)
      .digest("hex");
    let decision;
    try {
      decision = await consumeAuthRateLimit([
        {
          key:
            (new URL(request.url).pathname.endsWith("/activity")
              ? "security-activity:"
              : "security:") + a.user.id,
          limit: new URL(request.url).pathname.endsWith("/activity") ? 120 : 30,
          seconds: 900,
        },
        { key: "security-ip:" + ipDigest, limit: 240, seconds: 900 },
      ]);
    } catch {
      return Response.json(
        { message: "Security protection is temporarily unavailable." },
        { status: 503, headers: { "Retry-After": "5" } },
      );
    }

    if (decision.blocked)
      return Response.json(
        { message: "Too many security requests." },
        {
          status: 429,
          headers: { "Retry-After": String(decision.retryAfter) },
        },
      );
  })
  .onError(({ error }) =>
    error instanceof SecurityError
      ? Response.json(
          { message: error.message },
          { status: error.status, headers: { "Cache-Control": "no-store" } },
        )
      : undefined,
  )
  .onAfterHandle(({ set }) => {
    set.headers["Cache-Control"] = "no-store";
    set.headers["Referrer-Policy"] = "no-referrer";
  })
  .post("/activity", async ({ request }) => {
    const a = await securityActor(request);
    if (a.locked) throw new SecurityError(423, "Unlock this browser first.");
    await client`update session_security set last_activity_at=now() where session_id=${a.session.id}`;
    return { active: true };
  })
  .get("/status", async ({ request, set }) => {
    const a = await securityActor(request);
    const opaque = request.headers
      .get("cookie")
      ?.match(/(?:^|;\s*)capybudget_browser=([A-Za-z0-9_-]{43})/)?.[1];
    const digest = opaque
      ? createHash("sha256").update(opaque).digest("hex")
      : null;
    const [device] =
      await client`select token_digest from security_devices where id=${a.state.device_id}`;
    if (!digest || digest !== device!.token_digest) {
      const token = randomBytes(32).toString("base64url");
      await client`update security_devices set token_digest=${createHash("sha256").update(token).digest("hex")} where id=${a.state.device_id}`;
      set.headers["Set-Cookie"] =
        "capybudget_browser=" +
        token +
        "; HttpOnly; SameSite=Lax; Path=/; Max-Age=31536000" +
        (process.env.NODE_ENV === "production" ? "; Secure" : "");
    }
    const [preferences] =
      await client`select privacy_default from user_security_settings where user_id=${a.user.id}`;
    return {
      privacyDefault: preferences?.privacy_default ?? false,
      locked: a.locked,
      lockEnabled: a.state.lock_enabled,
      hasPin: a.state.has_pin,
      deviceId: a.state.device_id,
      twoFactorEnabled: Boolean(a.user.twoFactorEnabled),
    };
  })
  .put(
    "/preferences",
    async ({ request, body }) => {
      const a = await securityActor(request);
      await client`insert into user_security_settings(user_id,privacy_default) values(${a.user.id},${body.privacyDefault}) on conflict(user_id) do update set privacy_default=excluded.privacy_default,updated_at=now()`;
      return { saved: true };
    },
    { body: t.Object({ privacyDefault: t.Boolean() }) },
  )
  .post("/lock", async ({ request }) => {
    const a = await securityActor(request);
    await client`update session_security set locked_at=now() where session_id=${a.session.id}`;
    return { locked: Boolean(a.state.lock_enabled) };
  })
  .post(
    "/unlock/pin",
    async ({ request, body }) => {
      const result = await unlockPin(await securityActor(request), body.pin);
      return Response.json(
        {
          unlocked: result.status === 200,
          message: result.status === 200 ? "Unlocked." : "PIN rejected.",
        },
        {
          status: result.status,
          headers: result.retryAfter
            ? { "Retry-After": String(result.retryAfter) }
            : {},
        },
      );
    },
    { body: t.Object({ pin: t.String({ maxLength: 8 }) }) },
  )
  .post(
    "/reauthenticate",
    async ({ request, body }) => {
      const a = await securityActor(request);
      const [account] =
        await client`select password from account where user_id=${a.user.id} and provider_id='credential'`;
      if (
        !account?.password ||
        !(await verifyPassword({
          hash: account.password,
          password: body.password,
        }))
      )
        throw new SecurityError(403, "Authentication failed.");
      if (a.user.twoFactorEnabled) {
        if (!body.code)
          throw new SecurityError(403, "Authenticator code required.");
        try {
          if (/^\d{6}$/.test(body.code))
            await auth.api.verifyTOTP({
              headers: request.headers,
              body: { code: body.code, trustDevice: false },
            });
          else
            await auth.api.verifyBackupCode({
              headers: request.headers,
              body: { code: body.code, disableSession: true },
            });
        } catch {
          throw new SecurityError(
            403,
            "Second factor rejected. Use a new authenticator or unused recovery code.",
          );
        }
      }
      await client`update security_devices set failures=0,cooldown_until=null where id=${a.state.device_id}`;
      await client`update session_security set locked_at=null,unlocked_until=now()+interval '15 minutes',last_activity_at=now() where session_id=${a.session.id}`;
      const fresh = await securityActor(request);
      const [grant] =
        await client`insert into security_challenges(session_id,purpose,value,security_version,expires_at)
      values(${a.session.id},${body.purpose},'',${fresh.version},now()+interval '5 minutes') returning id`;
      await client`insert into security_events(user_id,action,outcome) values(${a.user.id},'reauthenticate','allowed')`;
      return { grant: grant!.id };
    },
    {
      body: t.Object({
        password: t.String({ minLength: 1, maxLength: 128 }),
        code: t.Optional(t.String({ maxLength: 32 })),
        purpose: t.Union(
          [
            "pin",
            "webauthn",
            "sessions",
            "factor",
            "export",
            "delete",
            "unlock",
          ].map((x) => t.Literal(x)),
        ),
      }),
    },
  )
  .put(
    "/pin",
    async ({ request, body }) => {
      const a = await consumeGrant(request, "pin");
      const hash = await hashPin(body.pin);
      await client`update security_devices set pin_hash=${hash},lock_enabled=true,failures=0,cooldown_until=null where id=${a.state.device_id}`;
      await client`update session_security set unlocked_until=now()+interval '15 minutes',locked_at=null,last_activity_at=now() where session_id=${a.session.id}`;
      return { enabled: true };
    },
    { body: t.Object({ pin: t.String({ pattern: "^[0-9]{6,8}$" }) }) },
  )
  .delete("/pin", async ({ request }) => {
    const a = await consumeGrant(request, "pin");
    await client`update security_devices set pin_hash=null,lock_enabled=exists(select 1 from webauthn_credentials where device_id=${a.state.device_id}) where id=${a.state.device_id}`;
    return { removed: true };
  })
  .get("/backups/status", async ({ request }) => {
    await securityActor(request);
    const [backup] =
      await client`select created_at,status from backup_runs where status='verified' order by created_at desc limit 1`;
    const [restore] =
      await client`select created_at,outcome from backup_restore_checks order by created_at desc limit 1`;
    const stale =
      !backup ||
      new Date(backup.created_at).getTime() < Date.now() - 26 * 3600000;
    return {
      lastVerifiedAt: backup?.created_at ?? null,
      stale,
      lastRestoreAt: restore?.created_at ?? null,
      restoreOutcome: restore?.outcome ?? null,
      destination: process.env.BACKUP_ENVIRONMENT_ID ?? "local",
      recoveryPointHours: 24,
      retentionDays: 35,
    };
  })
  .get("/sessions", async ({ request }) => {
    const a = await securityActor(request);
    const items =
      await client`select s.id,s.created_at,s.expires_at,s.updated_at,d.id as device_id,d.label from session s
      left join session_security ss on ss.session_id=s.id left join security_devices d on d.id=ss.device_id
      where s.user_id=${a.user.id} and s.expires_at>now() order by s.created_at desc`;
    return {
      items: items.map((row) => ({ ...row, current: row.id === a.session.id })),
    };
  })
  .delete("/sessions/:id", async ({ request, params }) => {
    const a = await consumeGrant(request, "sessions");
    await client`delete from session where id=${params.id} and user_id=${a.user.id}`;
    return { revoked: true };
  })
  .post("/sessions/revoke-others", async ({ request }) => {
    const a = await consumeGrant(request, "sessions");
    await client`delete from session where user_id=${a.user.id} and id<>${a.session.id}`;
    return { revoked: true };
  })
  .get("/devices", async ({ request }) => {
    const a = await securityActor(request);
    return {
      items:
        await client`select d.id,d.label,d.lock_enabled,d.created_at,d.revoked_at,
      (select count(*) from webauthn_credentials c where c.device_id=d.id)::int as credentials
      from security_devices d where user_id=${a.user.id} and revoked_at is null`,
    };
  })
  .delete("/devices/:id", async ({ request, params }) => {
    const a = await consumeGrant(request, "sessions");
    await client.begin(async (tx) => {
      const rows =
        await tx`update security_devices set revoked_at=now(),pin_hash=null where id=${params.id} and user_id=${a.user.id} returning id`;
      if (!rows.length) throw new SecurityError(404, "Browser not found.");
      await tx`delete from session where id in (select session_id from session_security where device_id=${params.id})`;
      await tx`delete from webauthn_credentials where device_id=${params.id}`;
      await tx`delete from push_subscriptions where (security_device_id=${params.id} or security_device_id is null) and user_id=${a.user.id}`;
    });
    return { removed: true };
  })
  .get("/webauthn/credentials", async ({ request }) => {
    const a = await securityActor(request);
    return {
      items:
        await client`select c.id,c.device_id,c.created_at,d.label from webauthn_credentials c join security_devices d on d.id=c.device_id where d.user_id=${a.user.id} and d.revoked_at is null`,
    };
  })
  .delete("/webauthn/credentials/:id", async ({ request, params }) => {
    const a = await consumeGrant(request, "webauthn");
    await client.begin(async (tx) => {
      const [credential] =
        await tx`delete from webauthn_credentials c using security_devices d where c.id=${params.id} and c.device_id=d.id and d.user_id=${a.user.id} returning c.device_id`;
      if (!credential) throw new SecurityError(404, "Credential not found.");
      await tx`update security_devices set lock_enabled=pin_hash is not null or exists(select 1 from webauthn_credentials where device_id=${credential.device_id}) where id=${credential.device_id}`;
    });
    return { removed: true };
  })
  .post("/webauthn/register/options", ({ request }) =>
    webauthnOptions(request, "register"),
  )
  .post(
    "/webauthn/register/verify",
    ({ request, body }) => webauthnVerify(request, "register", body),
    {
      body: t.Object({
        challengeId: t.String({ format: "uuid" }),
        response: t.Any(),
      }),
    },
  )
  .post("/webauthn/unlock/options", ({ request }) =>
    webauthnOptions(request, "unlock"),
  )
  .post(
    "/webauthn/unlock/verify",
    ({ request, body }) => webauthnVerify(request, "unlock", body),
    {
      body: t.Object({
        challengeId: t.String({ format: "uuid" }),
        response: t.Any(),
      }),
    },
  );
