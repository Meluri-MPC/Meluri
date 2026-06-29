export interface AuthSession {
  userId: string;
  sessionToken: string;
  provider: string;
  email: string;
  name: string;
  avatarUrl?: string;
  expiresAt: string;
}

const STORAGE_KEY = 'velumx_session';

function loadStoredSession(): AuthSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const session: AuthSession = JSON.parse(raw);
    if (new Date(session.expiresAt) < new Date()) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

function storeSession(session: AuthSession): void {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }
}

function clearSession(): void {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}

function openOAuthPopup(url: string): Promise<{ sessionToken: string; provider: string; expiresAt: string }> {
  return new Promise((resolve, reject) => {
    const width = 600;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup = window.open(
      url,
      'velumx-oauth',
      `width=${width},height=${height},left=${left},top=${top}`,
    );

    if (!popup) {
      reject(new Error('Popup blocked. Please allow popups and try again.'));
      return;
    }

    const interval = setInterval(() => {
      try {
        if (popup.closed) {
          clearInterval(interval);
          reject(new Error('OAuth window was closed'));
          return;
        }

        const popupUrl = popup.location.href;
        if (popupUrl.includes('sessionToken=')) {
          const params = new URL(popupUrl).searchParams;
          const sessionToken = params.get('sessionToken');
          const provider = params.get('provider');
          const expiresAt = params.get('expiresAt');

          if (sessionToken) {
            popup.close();
            clearInterval(interval);
            resolve({ sessionToken, provider: provider ?? 'unknown', expiresAt: expiresAt ?? '' });
          }
        }
      } catch {
        // Cross-origin: can't read URL yet, keep polling
      }
    }, 300);

    setTimeout(() => {
      clearInterval(interval);
      if (!popup.closed) popup.close();
      reject(new Error('OAuth timed out'));
    }, 120000);
  });
}

export class MpcAuth {
  private session: AuthSession | null = null;
  private backendUrl: string;

  constructor(options?: { backendUrl?: string }) {
    this.backendUrl = options?.backendUrl ?? 'http://localhost:3001';
    this.session = loadStoredSession();
  }

  async login(provider?: string): Promise<{ userId: string; sessionToken: string }> {
    if (this.session && new Date(this.session.expiresAt) > new Date()) {
      return { userId: this.session.userId, sessionToken: this.session.sessionToken };
    }

    const p = provider ?? 'google';

    if (p === 'email') {
      return this.loginWithEmail();
    }

    const popupResult = await openOAuthPopup(`${this.backendUrl}/oauth/${p}`);
    return this.fetchAndStoreProfile(popupResult.sessionToken, popupResult.expiresAt);
  }

  private async loginWithEmail(): Promise<{ userId: string; sessionToken: string }> {
    return new Promise((resolve, reject) => {
      const email = prompt('Enter your email address:');
      if (!email) { reject(new Error('Email required')); return; }

      const code = prompt('Enter the 6-digit code sent to your email:');
      if (!code) { reject(new Error('Verification code required')); return; }

      (async () => {
        try {
          const response = await fetch(`${this.backendUrl}/oauth/magic-link/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, code }),
          });

          if (!response.ok) {
            const err = await response.json();
            throw new Error(err.message ?? 'Magic link verification failed');
          }

          const data = await response.json();
          this.session = {
            userId: data.userId,
            sessionToken: data.sessionToken,
            provider: data.provider,
            email: data.email,
            name: data.name,
            avatarUrl: data.avatarUrl,
            expiresAt: data.expiresAt,
          };
          storeSession(this.session);
          resolve({ userId: data.userId, sessionToken: data.sessionToken });
        } catch (error: any) {
          reject(error);
        }
      })();
    });
  }

  private async fetchAndStoreProfile(sessionToken: string, expiresAt: string): Promise<{ userId: string; sessionToken: string }> {
    const response = await fetch(`${this.backendUrl}/oauth/session/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionToken }),
    });

    if (!response.ok) {
      throw new Error('Session validation failed');
    }

    const data = await response.json();
    this.session = {
      userId: data.session.userId,
      sessionToken,
      provider: data.session.provider,
      email: data.session.email,
      name: data.session.name,
      avatarUrl: data.session.avatarUrl,
      expiresAt: expiresAt || new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    };
    storeSession(this.session);

    return { userId: data.session.userId, sessionToken };
  }

  async loginWithProvider(provider: string): Promise<{ userId: string; sessionToken: string }> {
    return this.login(provider);
  }

  async logout(): Promise<void> {
    if (this.session?.sessionToken) {
      try {
        await fetch(`${this.backendUrl}/oauth/session/revoke`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionToken: this.session.sessionToken }),
        });
      } catch {}
    }
    this.session = null;
    clearSession();
  }

  async getSession(): Promise<{ userId: string; sessionToken: string } | null> {
    if (this.session && new Date(this.session.expiresAt) > new Date()) {
      return { userId: this.session.userId, sessionToken: this.session.sessionToken };
    }
    return null;
  }

  async sendMagicLink(email: string): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${this.backendUrl}/oauth/magic-link/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      throw new Error('Failed to send magic link');
    }

    return response.json();
  }

  async verifyMagicLink(email: string, code: string): Promise<{ userId: string; sessionToken: string }> {
    const response = await fetch(`${this.backendUrl}/oauth/magic-link/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code }),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message ?? 'Magic link verification failed');
    }

    const data = await response.json();
    this.session = {
      userId: data.userId,
      sessionToken: data.sessionToken,
      provider: data.provider,
      email: data.email,
      name: data.name,
      avatarUrl: data.avatarUrl,
      expiresAt: data.expiresAt,
    };
    storeSession(this.session);

    return { userId: data.userId, sessionToken: data.sessionToken };
  }

  getCurrentUser(): AuthSession | null {
    return this.session;
  }
}

export { openOAuthPopup };
