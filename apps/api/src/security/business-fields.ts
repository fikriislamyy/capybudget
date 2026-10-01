import { encryptField, decryptField } from "./encryption";
const fieldContext = (workspaceId: string, id: string, field: string) => ({
  purpose: "business-data",
  owner: workspaceId,
  entity: id,
  field,
});
export function protectedText(
  value: string | null,
  ws: string,
  id: string,
  field: string,
) {
  return value === null
    ? null
    : encryptField(value, fieldContext(ws, id, field));
}
export function protectedJson(
  value: unknown,
  ws: string,
  id: string,
  field: string,
) {
  return JSON.stringify({
    _protected: encryptField(
      JSON.stringify(value),
      fieldContext(ws, id, field),
    ),
  });
}
/** Keep the non-sensitive display name searchable; encrypt immutable contact details together. */
export function protectedContact(
  value: Record<string, unknown>,
  ws: string,
  id: string,
  field: string,
) {
  const { name, legalName, tradingName, ...contact } = value;
  return JSON.stringify({
    name,
    legalName,
    tradingName,
    _protected: encryptField(
      JSON.stringify(contact),
      fieldContext(ws, id, field),
    ),
  });
}
export function revealRow(row: Record<string, any>, workspaceId: string) {
  const output = { ...row };
  const aliases: Record<string, string> = {
    taxId: "tax_id",
    contactEmail: "contact_email",
    sellerSnapshot: "seller_snapshot",
    recipientSnapshot: "recipient_snapshot",
    paymentInstructions: "payment_instructions",
    proposalPayload: "payload",
  };
  for (const [column, value] of Object.entries(row)) {
    const field = aliases[column] ?? column;
    let parsed = value;
    if (typeof value === "string" && value.startsWith("{")) {
      try {
        parsed = JSON.parse(value);
      } catch {}
    }
    const entity =
      column === "proposalPayload"
        ? row.proposalId
        : ["tax_id", "contact_email", "phone", "address"].includes(field)
          ? workspaceId
          : field === "before" || field === "after"
            ? (row.entity_id ?? row.id)
            : row.id;
    if (typeof parsed === "string" && parsed.startsWith("cbenc:"))
      output[column] = decryptField(
        parsed,
        fieldContext(workspaceId, entity, field),
      );
    else if (parsed && typeof parsed === "object" && "_protected" in parsed) {
      const { _protected, ...publicFields } = parsed;
      const decrypted = JSON.parse(
        decryptField(_protected, fieldContext(workspaceId, entity, field)),
      );
      output[column] =
        decrypted && typeof decrypted === "object"
          ? { ...publicFields, ...decrypted }
          : decrypted;
    } else {
      const sensitive =
        [
          "tax_id",
          "contact_email",
          "phone",
          "address",
          "seller_snapshot",
          "recipient_snapshot",
          "payment_instructions",
          "reminder_message_snapshot",
        ].includes(field) ||
        (field === "reference" && "invoice_id" in row) ||
        (["before", "after"].includes(field) &&
          ["invoice", "business_profile"].includes(row.entity_type)) ||
        (field === "payload" && "action_type" in row);
      const nonempty =
        parsed !== null &&
        parsed !== undefined &&
        parsed !== "" &&
        (typeof parsed !== "object" || Object.keys(parsed).length > 0);
      if (sensitive && nonempty && process.env.ALLOW_PLAINTEXT_FIELDS !== "1")
        throw new Error("Protected field requires encryption migration.");
      if (["address", "seller_snapshot", "recipient_snapshot"].includes(field))
        output[column] = parsed;
    }
  }
  return output;
}
