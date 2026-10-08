export type EmailLocale = 'en' | 'id';

export type EmailMessage = {securityOwnerId?:string;securityGeneration?:number} & (
  | {kind:'scheduled-report';to:string;workspaceId:string;requestedBy:string;deliveryId:string;title:string;locale:EmailLocale;expiresAt:number}
  | {
      kind: 'business-invitation';
      to: string; url: string; businessName: string; role: string; workspaceId: string;
      invitationId: string; requestedBy: string; locale: EmailLocale; expiresAt: number;
    }
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
      notificationId?: string;
      deliveryId?: string;
      locale: EmailLocale;
      expiresAt: number;
    }
  | {
      kind: 'invoice-delivery';
      to: string;
      invoiceNumber: string;
      paymentUrl?: string;
      paymentSandbox?: boolean;
      paymentExpiresAt?: string;
      paymentLinkOnly?: boolean;
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
      paymentUrl?: string;
      paymentSandbox?: boolean;
      paymentExpiresAt?: string;
      paymentLinkOnly?: boolean;
      reminderMessage: string;
      locale: EmailLocale;
      expiresAt: number;
    }
  | {
      kind: 'assistant-alert' | 'assistant-summary';
      to: string;
      workspaceId: string;
      userId: string;
      notificationId: string;
      deliveryId: string;
      title: string;
      message: string;
      locale: EmailLocale;
      expiresAt: number;
    }

);

export type EncryptedEmailJob = {
  version: 1 | 2;
  keyId?: string;
  owner?: string;
  entity?: string;
  iv: string;
  tag: string;
  ciphertext: string;
  expiresAt: number;
};
