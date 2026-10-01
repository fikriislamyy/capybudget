import { createHmac } from "node:crypto";
import { client } from "../db";
import { SecurityError, type securityActor } from "./guards";

function pepper(pin: string) {
  const secret = process.env.PIN_PEPPER;
  if (!secret || secret.length < 32)
    throw new SecurityError(503, "PIN security key is not configured.");
  return createHmac("sha256", secret).update(pin).digest("hex");
}
export async function hashPin(pin: string) {
  if (!/^\d{6,8}$/.test(pin))
    throw new SecurityError(400, "Use a PIN of 6 to 8 digits.");
  return Bun.password.hash(pepper(pin), {
    algorithm: "argon2id",
    memoryCost: 65536,
    timeCost: 3,
  });
}
export async function unlockPin(
  actor: Awaited<ReturnType<typeof securityActor>>,
  pin: string,
) {
  return client.begin(async (tx) => {
    const [device] =
      await tx`select * from security_devices where id=${actor.state.device_id} and user_id=${actor.user.id} for update`;
    if (!device?.pin_hash || device.revoked_at)
      throw new SecurityError(403, "PIN unlock is unavailable.");
    if (device.failures >= 10)
      throw new SecurityError(
        403,
        "Full authentication is required to reset PIN unlock.",
      );
    if (
      device.cooldown_until &&
      new Date(device.cooldown_until).getTime() > Date.now()
    )
      return {
        status: 429,
        retryAfter: Math.ceil(
          (new Date(device.cooldown_until).getTime() - Date.now()) / 1000,
        ),
      };
    const valid =
      /^\d{6,8}$/.test(pin) &&
      (await Bun.password.verify(pepper(pin), device.pin_hash));
    if (!valid) {
      const failures = Number(device.failures) + 1;
      await tx`update security_devices set failures=${failures},cooldown_until=${failures >= 5 ? new Date(Date.now() + 900_000).toISOString() : null} where id=${device.id}`;
      await tx`insert into security_events(user_id,action,outcome) values(${actor.user.id},'pin.unlock','denied')`;
      return {
        status: failures >= 5 ? 429 : 403,
        retryAfter: failures >= 5 ? 900 : 0,
      };
    }
    await tx`update security_devices set failures=0,cooldown_until=null where id=${device.id}`;
    await tx`update session_security set locked_at=null,unlocked_until=now()+interval '15 minutes',last_activity_at=now() where session_id=${actor.session.id}`;
    return { status: 200, retryAfter: 0 };
  });
}
