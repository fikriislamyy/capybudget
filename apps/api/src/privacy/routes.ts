import { Elysia, t } from "elysia";
import { createHash, createHmac } from "node:crypto";
import { consumeAuthRateLimit } from "../auth/rate-limit";
import { client } from "../db";
import { securityActor, consumeGrant, SecurityError } from "../security/guards";
import { privacyArchive } from "./exports";
import { deletionPreview, requestDeletion } from "./deletion";
export const privacyRoutes = new Elysia({ prefix: "/api/privacy" })
  .onBeforeHandle(async ({ request }) => {
    if (new URL(request.url).pathname !== "/api/privacy/deletion/receipt")
      return;
    const ip = createHmac("sha256", process.env.BETTER_AUTH_SECRET!)
      .update(request.headers.get("x-capybudget-trusted-ip") ?? "unknown")
      .digest("hex");
    try {
      const decision = await consumeAuthRateLimit([
        { key: "deletion-receipt:" + ip, limit: 60, seconds: 900 },
      ]);
      if (decision.blocked)
        return Response.json(
          { message: "Too many receipt checks." },
          {
            status: 429,
            headers: { "Retry-After": String(decision.retryAfter) },
          },
        );
    } catch {
      return Response.json(
        { message: "Receipt checks are temporarily unavailable." },
        { status: 503, headers: { "Retry-After": "5" } },
      );
    }
  })
  .onError(({ error }) =>
    error instanceof SecurityError
      ? Response.json({ message: error.message }, { status: error.status })
      : undefined,
  )
  .onAfterHandle(({ set }) => {
    set.headers["Cache-Control"] = "no-store";
    set.headers["Referrer-Policy"] = "no-referrer";
  })
  .post(
    "/exports",
    async ({ request, body }) => {
      const a = await consumeGrant(request, "export");
      const [existing] =
        await client`select id,status from privacy_exports where user_id=${a.user.id} and request_key=${body.requestKey}`;
      if (existing) return existing;
      const [busy] =
        await client`select id from privacy_exports where user_id=${a.user.id} and status in ('queued','running')`;
      if (busy)
        throw new SecurityError(409, "An export is already in progress.");
      const [job] =
        await client`insert into privacy_exports(user_id,request_key,security_version) values(${a.user.id},${body.requestKey},${a.version}) returning id,status`;
      return job!;
    },
    { body: t.Object({ requestKey: t.String({ format: "uuid" }) }) },
  )
  .get("/exports", async ({ request }) => {
    const a = await securityActor(request);
    return {
      items:
        await client`select id,status,byte_count,created_at,expires_at,failure_code from privacy_exports where user_id=${a.user.id} order by created_at desc limit 20`,
    };
  })
  .post(
    "/exports/:id/download",
    async ({ request, params }) => {
      const a = await consumeGrant(request, "export");
      const [job] =
        await client`select * from privacy_exports where id=${params.id} and user_id=${a.user.id} and status='ready' and expires_at>now() and security_version=${a.version}`;
      if (!job) throw new SecurityError(404, "Export unavailable or expired.");
      const bytes = await privacyArchive(a.user.id, params.id, job.object_key);
      if (createHash("sha256").update(bytes).digest("hex") !== job.checksum)
        throw new SecurityError(503, "Archive verification failed.");
      return new Response(bytes, {
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition":
            'attachment; filename="capybudget-account.zip"',
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  )
  .post(
    "/deletion/receipt",
    async ({ body }) => {
      const digest = createHash("sha256").update(body.receipt).digest("hex");
      const [job] =
        await client`select status,created_at,completed_at,failure_code from account_deletion_requests where id=${body.id} and receipt_digest=${digest}`;
      if (!job) throw new SecurityError(404, "Receipt not found.");
      return { ...job, backupRetentionDays: 35 };
    },
    {
      body: t.Object({
        id: t.String({ format: "uuid" }),
        receipt: t.String({ minLength: 40, maxLength: 64 }),
      }),
    },
  )
  .get("/deletion/preview", async ({ request }) =>
    deletionPreview((await securityActor(request)).user.id),
  )
  .post(
    "/deletion",
    async ({ request, body }) => {
      const a = await consumeGrant(request, "delete");
      return requestDeletion(a.user.id, a.version, body.scopeVersion);
    },
    {
      body: t.Object({
        scopeVersion: t.String({ pattern: "^[a-f0-9]{64}$" }),
        confirmation: t.Literal("DELETE MY ACCOUNT"),
      }),
    },
  );
