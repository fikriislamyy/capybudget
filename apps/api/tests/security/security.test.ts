import { test, expect, afterAll } from "bun:test";
import { randomUUID } from "node:crypto";
import { hashPassword, symmetricDecrypt } from "better-auth/crypto";
import { encryptField, decryptField } from "../../src/security/encryption";
const context = {
  purpose: "test",
  owner: "alice",
  entity: "invoice",
  field: "tax-id",
};
test("authenticated encryption binds tenant, entity, field, key and version", () => {
  const ciphertext = encryptField("private-canary", context);
  expect(ciphertext).not.toContain("private-canary");
  expect(decryptField(ciphertext, context)).toBe("private-canary");
  for (const field of ["purpose", "owner", "entity", "field"] as const)
    expect(() =>
      decryptField(ciphertext, { ...context, [field]: "wrong" }),
    ).toThrow();
  const envelope = JSON.parse(
    Buffer.from(ciphertext.slice(6), "base64url").toString(),
  );
  envelope.tag = Buffer.alloc(16).toString("base64url");
  expect(() =>
    decryptField(
      "cbenc:" + Buffer.from(JSON.stringify(envelope)).toString("base64url"),
      context,
    ),
  ).toThrow();
  expect(() => decryptField("plaintext", context)).toThrow();
});
if (process.env.SECURITY_INTEGRATION === "1") {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test"))
    throw new Error("Disposable test database required.");
  const { client } = await import("../../src/db");
  const { app } = await import("../../src/app");
  const { auth } = await import("../../src/auth");
  const { runPrivacyExport, privacyArchive } =
    await import("../../src/privacy/exports");
  const { deletionPreview, requestDeletion, runDeletion } =
    await import("../../src/privacy/deletion");
  app.compile();
  const id = "security-" + randomUUID(),
    email = id + "@example.test",
    password = "StrongSecurityPassword!42";
  let cookie = "";
  let secondCookie = "";
  let deviceId = "";
  let uri = "";
  async function request(
    path: string,
    body?: unknown,
    method = body === undefined ? "GET" : "POST",
    token?: string,
    sessionCookie = cookie,
  ) {
    const response = await app.handle(
      new Request("http://localhost:5173/api/" + path, {
        method,
        headers: {
          cookie: sessionCookie,
          origin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
          "content-type": "application/json",
          ...(token ? { "x-security-grant": token } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    );
    const cookies = response.headers.getSetCookie();
    if (cookies.length && sessionCookie === cookie) {
      const jar = new Map(
        cookie
          .split("; ")
          .filter(Boolean)
          .map((c) => [c.split("=")[0], c]),
      );
      for (const entry of cookies) {
        const first = entry.split(";")[0]!;
        if (/Max-Age=0(?:;|$)/i.test(entry)) jar.delete(first.split("=")[0]!);
        else jar.set(first.split("=")[0]!, first);
      }
      cookie = [...jar.values()].join("; ");
    }
    return response;
  }
  async function grant(purpose: string) {
    const r = await request("security/reauthenticate", { password, purpose });
    expect(r.status).toBe(200);
    return (await r.json()).grant;
  }
  test("PIN, sessions, scope grants, API lock, export and resumable erasure", async () => {
    await client`insert into "user"(id,name,email,email_verified) values(${id},'Security Fixture',${email},true)`;
    const hash = await hashPassword(password);
    await client`insert into account(id,account_id,provider_id,user_id,password) values(${randomUUID()},${id},'credential',${id},${hash})`;
    let r = await request("auth/sign-in/email", { email, password });
    expect(r.status).toBe(200);
    expect(cookie).toContain("session_token");
    r = await request("security/status");
    expect(r.status).toBe(200);
    deviceId = (await r.json()).deviceId;
    const pinGrant = await grant("pin");
    r = await request("security/pin", { pin: "123456" }, "PUT", pinGrant);
    expect(r.status).toBe(200);
    r = await request("security/pin", { pin: "111111" }, "PUT", pinGrant);
    expect(r.status).toBe(403);
    r = await request("security/lock", {});
    expect(r.status).toBe(200);
    for (const path of [
      "me",
      "workspaces",
      "privacy/exports",
      "security/sessions",
    ]) {
      r = await request(path);
      expect(r.status).toBe(423);
    }
    for (let n = 0; n < 5; n++) {
      r = await request("security/unlock/pin", { pin: "000000" });
      if (r.status === 500) console.error(await r.clone().text());
      expect(r.status).toBe(n === 4 ? 429 : 403);
    }
    r = await request("security/unlock/pin", { pin: "123456" });
    expect(r.status).toBe(429);
    r = await request("security/reauthenticate", {
      password,
      purpose: "unlock",
    });
    expect(r.status).toBe(200);
    r = await request("workspaces");
    expect(r.status).toBe(200);
    const ws = (await r.json()).items[0];
    expect(ws.id).toBeDefined();
    r = await request("security/sessions");
    const sessions = (await r.json()).items;
    expect(sessions[0].token).toBeUndefined();
    const bad = await app.handle(
      new Request("http://localhost:5173/api/security/lock", {
        method: "POST",
        headers: { cookie, origin: "https://evil.test" },
      }),
    );
    expect(bad.status).toBe(403);
    r = await request(
      "privacy/exports",
      { requestKey: randomUUID() },
      "POST",
      await grant("export"),
    );
    expect(r.status).toBe(200);
    const job = await r.json();
    await runPrivacyExport(job.id);
    const [exported] =
      await client`select status,object_key,failure_code from privacy_exports where id=${job.id}`;
    expect(exported!.failure_code).toBeNull();
    expect(exported!.status).toBe("ready");
    const zip = await privacyArchive(id, job.id, exported!.object_key);
    expect(zip.subarray(0, 2).toString()).toBe("PK");
    const downloadGrant = await grant("export");
    r = await request(
      "privacy/exports/" + job.id + "/download",
      {},
      "POST",
      downloadGrant,
    );
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(Buffer.from(await r.arrayBuffer()).equals(zip)).toBe(true);
    expect(
      (
        await request(
          "privacy/exports/" + job.id + "/download",
          {},
          "POST",
          downloadGrant,
        )
      ).status,
    ).toBe(403);
    await client`update privacy_exports set expires_at=now()-interval '1 second' where id=${job.id}`;
    expect(
      (
        await request(
          "privacy/exports/" + job.id + "/download",
          {},
          "POST",
          await grant("export"),
        )
      ).status,
    ).toBe(404);
    const { privacySweep } = await import("../../src/privacy/worker");
    await privacySweep();
    const [expired] =
      await client`select status,object_key from privacy_exports where id=${job.id}`;
    expect(expired!.status).toBe("expired");
    expect(expired!.object_key).toBeNull();
    const preview = await deletionPreview(id);
    expect(preview.blocked).toBe(false);
    expect(preview.workspaces.length).toBe(1);
    const deletion = await requestDeletion(id, 1, preview.scopeVersion);
    r = await request("me");
    expect(r.status).toBe(401);
    r = await request("auth/sign-in/email", { email, password });
    expect(r.status).not.toBe(200);
    await runDeletion(deletion.id);
    const [erased] =
      await client`select status,failure_code from account_deletion_requests where id=${deletion.id}`;
    expect(erased!.failure_code).toBeNull();
    expect(erased!.status).toBe("completed");
    expect((await client`select id from "user" where id=${id}`).length).toBe(0);
  }, 60_000);
  test("TOTP enrollment, pending login, replay rejection, recovery and no trusted bypass", async () => {
    const uid = "factor-" + randomUUID(),
      mail = uid + "@example.test";
    cookie = "";
    await client`insert into "user"(id,name,email,email_verified) values(${uid},'Factor Fixture',${mail},true)`;
    await client`insert into account(id,account_id,provider_id,user_id,password) values(${randomUUID()},${uid},'credential',${uid},${await hashPassword(password)})`;
    let r = await request("auth/sign-in/email", { email: mail, password });
    expect(r.status).toBe(200);
    r = await request(
      "auth/two-factor/enable",
      { password },
      "POST",
      await grant("factor"),
    );
    expect(r.status).toBe(200);
    const setup = await r.json();
    expect(setup.backupCodes.length).toBe(10);
    const secret = new URL(setup.totpURI).searchParams.get("secret")!;
    const [pending] =
      await client`select two_factor_enabled from "user" where id=${uid}`;
    expect(pending!.two_factor_enabled).toBe(false);
    const [factor] =
      await client`select secret from two_factor where user_id=${uid}`;
    const originalSecret = await symmetricDecrypt({
      key: (await auth.$context).secretConfig,
      data: factor!.secret,
    });
    const { code } = await auth.api.generateTOTP({
      body: { secret: originalSecret },
    });
    r = await request("auth/two-factor/verify-totp", {
      code,
      trustDevice: false,
    });
    expect(r.status).toBe(200);
    const [enabled] =
      await client`select two_factor_enabled from "user" where id=${uid}`;
    expect(enabled!.two_factor_enabled).toBe(true);
    r = await request("auth/sign-out", {});
    expect(r.status).toBe(200);
    r = await request("auth/sign-in/email", { email: mail, password });
    expect((await r.json()).twoFactorRedirect).toBe(true);
    r = await request("workspaces");
    expect(r.status).toBe(401);
    r = await request("auth/two-factor/verify-totp", {
      code,
      trustDevice: true,
    });
    expect(r.status).toBe(400);
    r = await request("auth/two-factor/verify-totp", {
      code,
      trustDevice: false,
    });
    expect(r.status).toBe(401);
    await request("auth/sign-in/email", { email: mail, password });
    r = await request("auth/two-factor/verify-backup-code", {
      code: setup.backupCodes[0],
    });
    expect(r.status).toBe(200);
    r = await request("me");
    expect(r.status).toBe(200);
    await request("auth/sign-out", {});
    await request("auth/sign-in/email", { email: mail, password });
    r = await request("auth/two-factor/verify-backup-code", {
      code: setup.backupCodes[0],
    });
    expect(r.status).toBe(401);
    await request("auth/sign-out", {});
    cookie = "";
    await request("auth/sign-in/email", { email: mail, password });
    const pendingOne = cookie;
    cookie = "";
    await request("auth/sign-in/email", { email: mail, password });
    const pendingTwo = cookie;
    // Let the supported plugin's 3-per-10-second endpoint limiter reset.
    await Bun.sleep(10_050);
    const concurrent = await Promise.all([
      request(
        "auth/two-factor/verify-backup-code",
        { code: setup.backupCodes[1] },
        "POST",
        undefined,
        pendingOne,
      ),
      request(
        "auth/two-factor/verify-backup-code",
        { code: setup.backupCodes[1] },
        "POST",
        undefined,
        pendingTwo,
      ),
    ]);
    expect(concurrent.map((result) => result.status).sort()).toEqual([
      200, 401,
    ]);
    await client`delete from "user" where id=${uid}`;
  }, 30_000);
  test("session revocation and WebAuthn challenges remain scoped to their browser", async () => {
    const uid = "sessions-" + randomUUID(),
      mail = uid + "@example.test";
    cookie = "";
    await client`insert into "user"(id,name,email,email_verified) values(${uid},'Session Fixture',${mail},true)`;
    await client`insert into account(id,account_id,provider_id,user_id,password) values(${randomUUID()},${uid},'credential',${uid},${await hashPassword(password)})`;
    await request("auth/sign-in/email", { email: mail, password });
    await request("security/status");
    const first = cookie;
    cookie = "";
    await request("auth/sign-in/email", { email: mail, password });
    const secondStatus = await request("security/status"),
      secondDevice = (await secondStatus.json()).deviceId;
    secondCookie = cookie;
    cookie = first;
    let r = await request("security/sessions");
    let sessions = (await r.json()).items;
    expect(sessions.length).toBe(2);
    const other = sessions.find((row: any) => !row.current);
    expect(other).toBeDefined();
    r = await request(
      "security/sessions/" + other.id,
      undefined,
      "DELETE",
      await grant("sessions"),
    );
    expect(r.status).toBe(200);
    expect(
      (await request("workspaces", undefined, "GET", undefined, secondCookie))
        .status,
    ).toBe(401);
    expect((await request("workspaces")).status).toBe(200);
    cookie = "";
    await request("auth/sign-in/email", { email: mail, password });
    await request("security/status");
    secondCookie = cookie;
    cookie = first;
    r = await request(
      "security/webauthn/register/options",
      {},
      "POST",
      await grant("webauthn"),
    );
    expect(r.status).toBe(200);
    const ceremony = await r.json();
    expect(
      (
        await request(
          "security/webauthn/register/verify",
          { challengeId: ceremony.challengeId, response: {} },
          "POST",
          undefined,
          secondCookie,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await request("security/webauthn/register/verify", {
          challengeId: ceremony.challengeId,
          response: {},
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request("security/webauthn/register/verify", {
          challengeId: ceremony.challengeId,
          response: {},
        })
      ).status,
    ).toBe(403);
    r = await request(
      "security/sessions/revoke-others",
      {},
      "POST",
      await grant("sessions"),
    );
    expect(r.status).toBe(200);
    expect(
      (await request("workspaces", undefined, "GET", undefined, secondCookie))
        .status,
    ).toBe(401);
    r = await request(
      "security/devices/" + secondDevice,
      undefined,
      "DELETE",
      await grant("sessions"),
    );
    expect(r.status).toBe(200);
    const preview = await deletionPreview(uid);
    await runDeletion((await requestDeletion(uid, 1, preview.scopeVersion)).id);
  }, 30_000);
  test("ten PIN failures disable quick unlock and idle/absolute leases fail closed", async () => {
    const { securityActor } = await import("../../src/security/guards"),
      { unlockPin } = await import("../../src/security/pin");
    const uid = "pin-limit-" + randomUUID(),
      mail = uid + "@example.test";
    cookie = "";
    await client`insert into "user"(id,name,email,email_verified) values(${uid},'PIN Fixture',${mail},true)`;
    await client`insert into account(id,account_id,provider_id,user_id,password) values(${randomUUID()},${uid},'credential',${uid},${await hashPassword(password)})`;
    await request("auth/sign-in/email", { email: mail, password });
    const device = (await (await request("security/status")).json()).deviceId;
    expect(
      (
        await request(
          "security/pin",
          { pin: "123456" },
          "PUT",
          await grant("pin"),
        )
      ).status,
    ).toBe(200);
    await request("security/lock", {});
    for (let n = 0; n < 10; n++) {
      await client`update security_devices set cooldown_until=null where id=${device}`;
      const actor = await securityActor(
        new Request("http://localhost:5173/api/security/status", {
          headers: { cookie },
        }),
      );
      expect((await unlockPin(actor, "000000")).status).toBe(
        n >= 4 ? 429 : 403,
      );
    }
    expect(
      (await request("security/unlock/pin", { pin: "123456" })).status,
    ).toBe(403);
    expect(
      (
        await request("security/reauthenticate", {
          password,
          purpose: "unlock",
        })
      ).status,
    ).toBe(200);
    const [counter] =
      await client`select failures from security_devices where id=${device}`;
    expect(counter!.failures).toBe(0);
    await client`update session_security set last_activity_at=now()-interval '6 minutes' where device_id=${device}`;
    expect((await request("workspaces")).status).toBe(423);
    await request("security/reauthenticate", { password, purpose: "unlock" });
    await client`update session_security set unlocked_until=now()-interval '1 second' where device_id=${device}`;
    expect((await request("workspaces")).status).toBe(423);
    const status = await (await request("security/status")).json();
    expect(status.locked).toBe(true);
    expect(status.balance).toBeUndefined();
    const preview = await deletionPreview(uid);
    await runDeletion((await requestDeletion(uid, 1, preview.scopeVersion)).id);
  }, 30_000);
  if (process.env.SECURITY_RLS === "1")
    test("normal database role cannot read or mutate another workspace", async () => {
      const identities = [] as { id: string; ws: string; cookie: string }[];
      const [role] =
        await client`select rolsuper,rolbypassrls from pg_roles where rolname=current_user`;
      expect(role!.rolsuper).toBe(false);
      expect(role!.rolbypassrls).toBe(false);
      for (let index = 0; index < 2; index++) {
        const uid = "rls-" + randomUUID(),
          mail = uid + "@example.test";
        cookie = "";
        await client`insert into "user"(id,name,email,email_verified) values(${uid},'RLS Fixture',${mail},true)`;
        await client`insert into account(id,account_id,provider_id,user_id,password) values(${randomUUID()},${uid},'credential',${uid},${await hashPassword(password)})`;
        await request("auth/sign-in/email", { email: mail, password });
        await request("security/status");
        const ws = (await (await request("workspaces")).json()).items[0].id;
        expect(
          (
            await request("workspaces/" + ws + "/accounts", {
              name: "RLS wallet",
              kind: "cash",
              openingBalance: "10",
            })
          ).status,
        ).toBe(201);
        identities.push({ id: uid, ws, cookie });
      }
      const [a, b] = identities;
      cookie = a!.cookie;
      expect((await request("workspaces/" + b!.ws + "/accounts")).status).toBe(
        404,
      );
      await client.begin(async (tx) => {
        await tx`select set_config('app.user_id',${a!.id},true),set_config('app.workspace_id',${b!.ws},true)`;
        expect(
          (await tx`select id from accounts where workspace_id=${b!.ws}`)
            .length,
        ).toBe(0);
        expect(
          (
            await tx`update accounts set name='forbidden' where workspace_id=${b!.ws} returning id`
          ).length,
        ).toBe(0);
      });
      for (const identity of identities) {
        const preview = await deletionPreview(identity.id);
        await runDeletion(
          (await requestDeletion(identity.id, 1, preview.scopeVersion)).id,
        );
        expect(
          (await client`select id from "user" where id=${identity.id}`).length,
        ).toBe(0);
      }
    }, 30_000);
  afterAll(async () => {
    await client.end();
  });
}

test("historical keys survive rotation and missing keys fail closed", () => {
  const originalKeys = process.env.FIELD_ENCRYPTION_KEYS,
    originalActive = process.env.FIELD_ENCRYPTION_ACTIVE_KEY;
  try {
    const old = encryptField("rotation-canary", context),
      ring = JSON.parse(originalKeys!);
    ring["rotation-test"] = Buffer.alloc(32, 7).toString("base64");
    process.env.FIELD_ENCRYPTION_KEYS = JSON.stringify(ring);
    process.env.FIELD_ENCRYPTION_ACTIVE_KEY = "rotation-test";
    const fresh = encryptField("rotation-canary", context);
    expect(fresh).not.toBe(old);
    expect(decryptField(old, context)).toBe("rotation-canary");
    expect(decryptField(fresh, context)).toBe("rotation-canary");
    delete ring[originalActive!];
    process.env.FIELD_ENCRYPTION_KEYS = JSON.stringify(ring);
    expect(() => decryptField(old, context)).toThrow();
  } finally {
    process.env.FIELD_ENCRYPTION_KEYS = originalKeys;
    process.env.FIELD_ENCRYPTION_ACTIVE_KEY = originalActive;
  }
});

test("push credential encryption rejects a different user, workspace or endpoint", async () => {
  const { encryptPushAuth, decryptPushAuth } =
    await import("../../src/personal-finance/push-crypto");
  const scope = {
    userId: "push-owner",
    workspaceId: randomUUID(),
    endpoint: "https://push.example.test/private-endpoint",
  };
  const encrypted = encryptPushAuth("push-private-canary", scope);
  expect(encrypted).not.toContain("push-private-canary");
  expect(decryptPushAuth(encrypted, scope)).toBe("push-private-canary");
  for (const field of ["userId", "workspaceId", "endpoint"] as const)
    expect(() =>
      decryptPushAuth(encrypted, { ...scope, [field]: "different" }),
    ).toThrow();
});
