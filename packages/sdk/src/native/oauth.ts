import { NativeAuthProvider } from './types';

export type OAuthBrowser = 'expo-web-browser' | 'react-native-inappbrowser' | 'linking';

export interface OAuthConfig {
  authUrl: string;
  redirectUrl: string;
  clientId: string;
  browser?: OAuthBrowser;
}

export class NativeOAuth implements NativeAuthProvider {
  private userId: string | null = null;
  private sessionToken: string | null = null;
  private browserImpl: any = null;

  constructor(private config: OAuthConfig) {}

  async login(): Promise<{ userId: string; sessionToken: string }> {
    const browser = await this.getBrowser();

    if (browser.type === 'expo') {
      const result = await browser.impl.openAuthSessionAsync(
        `${this.config.authUrl}?client_id=${this.config.clientId}&redirect_uri=${encodeURIComponent(this.config.redirectUrl)}&response_type=token`,
        this.config.redirectUrl
      );
      if (result.type !== 'success') throw new Error('OAuth login cancelled');
      return this.parseAuthResponse(result.url);
    }

    if (browser.type === 'inapp') {
      await browser.impl.open(this.config.authUrl);
      throw new Error(
        'react-native-inappbrowser does not support automatic redirect capture. ' +
        'Use expo-web-browser for a better experience, or handle the redirect manually via Linking.'
      );
    }

    throw new Error(
      'No OAuth browser implementation found. Install one of:\n' +
      '  - npx expo install expo-web-browser\n' +
      '  - npm install react-native-inappbrowser'
    );
  }

  async logout(): Promise<void> {
    this.userId = null;
    this.sessionToken = null;
  }

  async getSession(): Promise<{ userId: string; sessionToken: string } | null> {
    if (!this.userId || !this.sessionToken) return null;
    return { userId: this.userId, sessionToken: this.sessionToken };
  }

  private async getBrowser(): Promise<{ type: 'expo' | 'inapp'; impl: any }> {
    if (this.browserImpl) return this.browserImpl;

    const preferred = this.config.browser || 'expo-web-browser';

    if (preferred === 'expo-web-browser') {
      try {
        const expoBrowser = require('expo-web-browser');
        this.browserImpl = { type: 'expo' as const, impl: expoBrowser };
        return this.browserImpl;
      } catch {}
    }

    if (preferred === 'react-native-inappbrowser') {
      try {
        const inapp = require('react-native-inappbrowser');
        this.browserImpl = { type: 'inapp' as const, impl: inapp };
        return this.browserImpl;
      } catch {}
    }

    try {
      const expoBrowser = require('expo-web-browser');
      this.browserImpl = { type: 'expo' as const, impl: expoBrowser };
      return this.browserImpl;
    } catch {}

    try {
      const inapp = require('react-native-inappbrowser');
      this.browserImpl = { type: 'inapp' as const, impl: inapp };
      return this.browserImpl;
    } catch {}

    throw new Error(
      'No OAuth browser implementation found. Install one of:\n' +
      '  - npx expo install expo-web-browser\n' +
      '  - npm install react-native-inappbrowser'
    );
  }

  private parseAuthResponse(url: string): { userId: string; sessionToken: string } {
    const fragment = url.includes('#') ? url.split('#')[1] : '';
    const params = new URLSearchParams(fragment.includes('?') ? fragment.split('?')[1] : fragment);
    const token = params.get('access_token') || params.get('token') || '';
    const userId = params.get('user_id') || params.get('sub') || '';

    if (!token) throw new Error('No access token in OAuth response');

    this.userId = userId || 'native-user';
    this.sessionToken = token;

    return { userId: this.userId, sessionToken: this.sessionToken };
  }
}
