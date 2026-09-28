export type EmailLocale = 'en' | 'id';

export type EmailMessage =
  | {
      kind: 'verification';
      to: string;
      otp: string;
      locale: EmailLocale;
      expiresAt: number;
    }
  | {
      kind: 'password-reset';
      to: string;
      url: string;
      locale: EmailLocale;
      expiresAt: number;
    }
  | {
      kind: 'bill-reminder';
      to: string;
      billName: string;
      amount: string;
      currency: string;
      dueDate: string;
      workspaceId: string;
      userId: string;
      occurrenceId: string;
      locale: EmailLocale;
      expiresAt: number;
    };

export type EncryptedEmailJob = {
  version: 1;
  iv: string;
  tag: string;
  ciphertext: string;
  expiresAt: number;
};
