import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  hkdfSync,
} from "node:crypto";
export type EncryptionContext = {
  purpose: string;
  owner: string;
  entity: string;
  field: string;
};
type Envelope = {
  version: 1 | 2;
  keyId: string;
  algorithm: "AES-256-GCM";
  nonce: string;
  ciphertext: string;
  tag: string;
};
function keyring() {
  const raw = process.env.FIELD_ENCRYPTION_KEYS;
  if (!raw) throw new Error("Field encryption keys unavailable.");
  const keys = JSON.parse(raw) as Record<string, string>;
  const active = process.env.FIELD_ENCRYPTION_ACTIVE_KEY;
  if (!active || !keys[active])
    throw new Error("Active field encryption key unavailable.");
  return { keys, active };
}
function key(id: string) {
  const { keys } = keyring();
  if (!keys[id]) throw new Error("Historical encryption key unavailable.");
  const k = Buffer.from(keys[id]!, "base64");
  if (k.length !== 32) throw new Error("Invalid encryption key length.");
  return k;
}
function purposeKey(id: string, purpose: string) {
  return Buffer.from(
    hkdfSync("sha256", key(id), "capybudget-field-encryption-v2", purpose, 32),
  );
}
const aad = (c: EncryptionContext) =>
  Buffer.from(JSON.stringify([c.purpose, c.owner, c.entity, c.field]));
export function encryptField(
  value: string,
  context: EncryptionContext,
): string {
  const { active } = keyring(),
    iv = randomBytes(12),
    cipher = createCipheriv(
      "aes-256-gcm",
      purposeKey(active, context.purpose),
      iv,
    );
  cipher.setAAD(aad(context));
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const envelope: Envelope = {
    version: 2,
    keyId: active,
    algorithm: "AES-256-GCM",
    nonce: iv.toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
  };
  return "cbenc:" + Buffer.from(JSON.stringify(envelope)).toString("base64url");
}
export function decryptField(
  value: string,
  context: EncryptionContext,
): string {
  if (!value.startsWith("cbenc:"))
    throw new Error("Protected field is not encrypted.");
  const e = JSON.parse(
    Buffer.from(value.slice(6), "base64url").toString(),
  ) as Envelope;
  if (![1, 2].includes(e.version) || e.algorithm !== "AES-256-GCM")
    throw new Error("Unsupported encryption envelope.");
  const nonce = Buffer.from(e.nonce, "base64url"),
    tag = Buffer.from(e.tag, "base64url");
  if (nonce.length !== 12 || tag.length !== 16)
    throw new Error("Invalid encryption envelope.");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    e.version === 2 ? purposeKey(e.keyId, context.purpose) : key(e.keyId),
    nonce,
  );
  decipher.setAAD(aad(context));
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(Buffer.from(e.ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
