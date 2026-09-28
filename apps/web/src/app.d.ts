declare global {
  namespace App {
    interface Locals {
      user: { id: string; name: string; email: string; emailVerified: boolean } | null;
      sessionState: 'available' | 'unavailable';
    }
  }
}

export {};
