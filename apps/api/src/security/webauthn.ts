import {
  generateRegistrationOptions,
  generateAuthenticationOptions,
  verifyRegistrationResponse,
  verifyAuthenticationResponse,
  type AuthenticatorTransport,
} from "@simplewebauthn/server";
import { client } from "../db";
import { securityActor, consumeGrant, SecurityError } from "./guards";
const origin = process.env.WEB_ORIGIN ?? "http://localhost:5173";
const rpID = new URL(origin).hostname;
export async function webauthnOptions(
  request: Request,
  purpose: "register" | "unlock",
) {
  const a =
    purpose === "register"
      ? await consumeGrant(request, "webauthn")
      : await securityActor(request);
  const credentials =
    await client`select id,transports from webauthn_credentials where device_id=${a.state.device_id}`;
  if (purpose === "unlock" && !credentials.length)
    throw new SecurityError(404, "No device credential registered.");
  const options =
    purpose === "register"
      ? await generateRegistrationOptions({
          rpName: "CapyBudget",
          rpID,
          userName: a.user.email,
          userID: new TextEncoder().encode(a.state.device_id),
          attestationType: "none",
          authenticatorSelection: {
            authenticatorAttachment: "platform",
            userVerification: "required",
            residentKey: "preferred",
          },
          excludeCredentials: credentials.map((c) => ({ id: c.id })),
        })
      : await generateAuthenticationOptions({
          rpID,
          userVerification: "required",
          allowCredentials: credentials.map((c) => ({
            id: c.id,
            transports: (typeof c.transports === "string"
              ? JSON.parse(c.transports)
              : c.transports) as AuthenticatorTransport[],
          })),
        });
  const [challenge] =
    await client`insert into security_challenges(session_id,purpose,value,security_version,expires_at)
    values(${a.session.id},${"webauthn-" + purpose},${options.challenge},${a.version},now()+interval '5 minutes') returning id`;
  return { challengeId: challenge!.id, options };
}
export async function webauthnVerify(
  request: Request,
  purpose: "register" | "unlock",
  body: { challengeId: string; response: any },
) {
  const a = await securityActor(request);
  const [challenge] =
    await client`update security_challenges set consumed_at=now() where id=${body.challengeId} and session_id=${a.session.id}
      and security_version=${a.version} and purpose=${"webauthn-" + purpose} and consumed_at is null and expires_at>now() returning value`;
  if (!challenge)
    throw new SecurityError(403, "Challenge expired or already used.");
  return client.begin(async (tx) => {
    const [device] =
      await tx`select id from security_devices where id=${a.state.device_id} and user_id=${a.user.id} and revoked_at is null for update`;
    const [owner] =
      await tx`select id from "user" where id=${a.user.id} and account_status='active' and security_version=${a.version}`;
    const [session] =
      await tx`select id from session where id=${a.session.id} and user_id=${a.user.id} and expires_at>now()`;
    if (!device || !owner || !session)
      throw new SecurityError(
        403,
        "Device verification is no longer authorized.",
      );
    if (purpose === "register") {
      const result = await verifyRegistrationResponse({
        response: body.response,
        expectedChallenge: challenge.value,
        expectedOrigin: origin,
        expectedRPID: rpID,
        requireUserVerification: true,
      }).catch(() => {
        throw new SecurityError(403, "Device verification failed.");
      });
      if (!result.verified || !result.registrationInfo)
        throw new SecurityError(403, "Device verification failed.");
      const c = result.registrationInfo.credential;
      await tx`insert into webauthn_credentials(id,device_id,public_key,counter,transports) values(${c.id},${a.state.device_id},${Buffer.from(c.publicKey).toString("base64")},${c.counter},${JSON.stringify(c.transports ?? [])}::jsonb)`;
      await tx`update security_devices set lock_enabled=true where id=${a.state.device_id}`;
    } else {
      const [c] =
        await tx`select * from webauthn_credentials where id=${body.response.id} and device_id=${a.state.device_id} for update`;
      if (!c) throw new SecurityError(403, "Device credential not found.");
      const result = await verifyAuthenticationResponse({
        response: body.response,
        expectedChallenge: challenge.value,
        expectedOrigin: origin,
        expectedRPID: rpID,
        requireUserVerification: true,
        credential: {
          id: c.id,
          publicKey: new Uint8Array(Buffer.from(c.public_key, "base64")),
          counter: Number(c.counter),
          transports: (typeof c.transports === "string"
            ? JSON.parse(c.transports)
            : c.transports) as AuthenticatorTransport[],
        },
      }).catch(() => {
        throw new SecurityError(403, "Device verification failed.");
      });
      if (!result.verified)
        throw new SecurityError(403, "Device verification failed.");
      await tx`update webauthn_credentials set counter=${result.authenticationInfo.newCounter} where id=${c.id}`;
    }
    await tx`update session_security set locked_at=null,unlocked_until=now()+interval '15 minutes',last_activity_at=now() where session_id=${a.session.id}`;
    return { verified: true };
  });
}
