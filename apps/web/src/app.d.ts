declare global {
  namespace App {
    interface Locals {
      user: { id: string; name: string; email: string; emailVerified: boolean } | null;
      invitation: import('$lib/invitation').InvitationFlow | null;
      sessionState: 'available' | 'unavailable';
    }
  }
}

export {};
