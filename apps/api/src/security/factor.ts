import { createHmac } from "node:crypto";
import { client } from "../db";

/** Reject the same accepted authenticator code across sessions and step-up requests.
 * Retention exceeds the verifier's neighboring time-step window. Only a keyed digest persists. */
export async function acceptFactorCode(userId: string, code: string) {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("Authentication key unavailable.");
  const digest = createHmac("sha256", secret)
    .update("totp-replay\0" + userId + "\0" + code)
    .digest("hex");
  const rows =
    await client`insert into factor_replays(digest,expires_at) values(${digest},now()+interval '2 minutes')
    on conflict(digest) do update set expires_at=excluded.expires_at where factor_replays.expires_at<now() returning digest`;
  return rows.length === 1;
}
