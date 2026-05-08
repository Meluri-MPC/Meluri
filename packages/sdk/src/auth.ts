export class MpcAuth {
  private clerk: any = null;

  constructor(private clerkPublishableKey?: string) {}

  async login(): Promise<{ userId: string; sessionToken: string }> {
    const Clerk = await this.loadClerk();
    if (!Clerk.user) await Clerk.openSignIn();
    const userId = Clerk.user?.id;
    if (!userId) throw new Error('Clerk authentication failed');
    const sessionToken = (await Clerk.session?.getToken()) ?? '';
    return { userId, sessionToken };
  }

  async logout(): Promise<void> {
    const Clerk = await this.loadClerk();
    if (Clerk.user) await Clerk.signOut();
  }

  async getSession(): Promise<{ userId: string; sessionToken: string } | null> {
    const Clerk = await this.loadClerk();
    if (!Clerk.user) return null;
    return { userId: Clerk.user.id, sessionToken: (await Clerk.session?.getToken()) ?? '' };
  }

  private async loadClerk(): Promise<any> {
    if (this.clerk) return this.clerk;
    if ((window as any).Clerk) { this.clerk = (window as any).Clerk; return this.clerk; }
    throw new Error('Clerk not loaded. Wrap your app with ClerkProvider.');
  }
}
