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
    }
  | {
      kind: 'invoice-delivery';
      to: string;
      invoiceNumber: string;
      workspaceId: string;
      deliveryId: string;
      requestedBy: string;
      locale: EmailLocale;
      expiresAt: number;
    }
  | {
      kind: 'invoice-reminder';
      to: string;
      workspaceId: string;
      deliveryId: string;
      requestedBy: string;
      invoiceNumber: string;
      reminderMessage: string;
      locale: EmailLocale;
      expiresAt: number;
    }
  | {
      kind: 'assistant-alert';
      to: string;
      workspaceId: string;
      userId: string;
      notificationId: string;
      title: string;
      message: string;
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
