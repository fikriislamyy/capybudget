/** Shared by the auth API and UI; never trim or normalize passwords. */
export function passwordRequirements(password: string) {
  return [
    { id: 'uppercase', met: /\p{Lu}/u.test(password) },
    { id: 'lowercase', met: /\p{Ll}/u.test(password) },
    { id: 'number', met: /\p{Nd}/u.test(password) },
    { id: 'symbol', met: /[^\p{L}\p{N}\s]/u.test(password) },
    { id: 'length', met: Array.from(password).length >= 12 },
  ] as const;
}
export function meetsPasswordPolicy(password: unknown): password is string {
  return typeof password === 'string' && password.length <= 128 && passwordRequirements(password).every(rule => rule.met);
}
