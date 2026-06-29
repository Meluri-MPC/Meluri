import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { getProviderConfigs, OAuthProviderConfig, OAuthProfile } from './oauth-config';
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);
  private readonly jwtSecret: string;
  private readonly sessionDurationMs = 2 * 60 * 60 * 1000; // 2 hours

  constructor(private prisma: PrismaService) {
    this.jwtSecret = process.env.JWT_SECRET ?? 'velumx-dev-secret-change-in-prod';
  }

  getRedirectBase(): string {
    return process.env.OAUTH_REDIRECT_BASE ?? 'http://localhost:3001';
  }

  getProviders(): string[] {
    return ['google', 'github', 'discord', 'twitter', 'apple', 'email'];
  }

  getAuthUrl(provider: string, state: string): string {
    const configs = getProviderConfigs(this.getRedirectBase());
    const config = configs[provider];
    if (!config) throw new Error(`Unknown provider: ${provider}`);

    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: 'code',
      scope: config.scopes.join(' '),
      state,
    });
    return `${config.authUrl}?${params.toString()}`;
  }

  async handleCallback(provider: string, code: string): Promise<{
    profile: OAuthProfile;
    sessionToken: string;
    expiresAt: Date;
  }> {
    const configs = getProviderConfigs(this.getRedirectBase());
    const config = configs[provider];
    if (!config) throw new Error(`Unknown provider: ${provider}`);

    const accessToken = await this.exchangeCodeForToken(config, code);
    const userData = await this.fetchUserInfo(config, accessToken);
    const profile = config.profileTransform(userData);

    const userId = `${provider}:${profile.providerUserId}`;
    const sessionToken = this.issueSessionToken(userId, profile);
    const expiresAt = new Date(Date.now() + this.sessionDurationMs);

    await this.prisma.oAuthSession.upsert({
      where: { sessionToken },
      update: {
        accessToken,
        tokenExpiresAt: new Date(Date.now() + 3600 * 1000),
        sessionExpiresAt: expiresAt,
      },
      create: {
        userId,
        provider,
        providerUserId: profile.providerUserId,
        email: profile.email,
        name: profile.name,
        avatarUrl: profile.avatarUrl,
        accessToken,
        sessionToken,
        sessionExpiresAt: expiresAt,
      },
    });

    return { profile, sessionToken, expiresAt };
  }

  private issueSessionToken(userId: string, profile: OAuthProfile): string {
    return crypto.createHmac('sha256', this.jwtSecret)
      .update(`${userId}:${Date.now()}:${crypto.randomBytes(16).toString('hex')}`)
      .digest('hex');
  }

  private async exchangeCodeForToken(config: OAuthProviderConfig, code: string): Promise<string> {
    const body = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: config.redirectUri,
    });

    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Token exchange failed: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    return data.access_token;
  }

  private async fetchUserInfo(config: OAuthProviderConfig, accessToken: string): Promise<Record<string, any>> {
    const response = await fetch(config.userInfoUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`User info fetch failed: ${response.status} ${errorText}`);
    }

    return response.json();
  }

  async validateSession(sessionToken: string): Promise<{
    userId: string;
    email: string;
    name: string;
    avatarUrl?: string;
    provider: string;
  } | null> {
    const session = await this.prisma.oAuthSession.findUnique({
      where: { sessionToken },
    });

    if (!session) return null;
    if (new Date() > session.sessionExpiresAt) {
      await this.prisma.oAuthSession.delete({ where: { sessionToken } });
      return null;
    }

    return {
      userId: session.userId,
      email: session.email ?? '',
      name: session.name ?? '',
      avatarUrl: session.avatarUrl ?? undefined,
      provider: session.provider,
    };
  }

  async revokeSession(sessionToken: string): Promise<void> {
    await this.prisma.oAuthSession.deleteMany({
      where: { sessionToken },
    });
  }

  // ─── Email Magic Link ────────────────────────────────────────────────

  private magicCodes = new Map<string, { code: string; expiresAt: number }>();

  async sendMagicLink(email: string): Promise<void> {
    const code = crypto.randomInt(100000, 999999).toString();
    const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes

    this.magicCodes.set(email.toLowerCase(), { code, expiresAt });

    this.logger.log(`[MAGIC LINK] Email: ${email}, Code: ${code}`);

    if (process.env.SENDGRID_API_KEY) {
      try {
        await fetch('https://api.sendgrid.com/v3/mail/send', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            personalizations: [{ to: [{ email }] }],
            from: { email: process.env.SENDGRID_FROM ?? 'noreply@velumx.com' },
            subject: 'Your VelumX login code',
            content: [{ type: 'text/plain', value: `Your verification code is: ${code}` }],
          }),
        });
      } catch (err: any) {
        this.logger.error(`Failed to send magic link email: ${err.message}`);
      }
    }
  }

  async verifyMagicLink(email: string, code: string): Promise<{
    profile: OAuthProfile;
    sessionToken: string;
    expiresAt: Date;
  }> {
    const entry = this.magicCodes.get(email.toLowerCase());
    if (!entry) throw new Error('No magic link code found for this email');
    if (Date.now() > entry.expiresAt) {
      this.magicCodes.delete(email.toLowerCase());
      throw new Error('Magic link code expired');
    }
    if (entry.code !== code) throw new Error('Invalid magic link code');

    this.magicCodes.delete(email.toLowerCase());

    const userId = `email:${email.toLowerCase()}`;
    const profile: OAuthProfile = {
      providerUserId: email.toLowerCase(),
      email,
      name: email.split('@')[0],
      provider: 'email',
    };

    const sessionToken = this.issueSessionToken(userId, profile);
    const expiresAt = new Date(Date.now() + this.sessionDurationMs);

    await this.prisma.oAuthSession.upsert({
      where: { sessionToken },
      update: { sessionExpiresAt: expiresAt },
      create: {
        userId,
        provider: 'email',
        providerUserId: email.toLowerCase(),
        email,
        name: email.split('@')[0],
        sessionToken,
        sessionExpiresAt: expiresAt,
      },
    });

    return { profile, sessionToken, expiresAt };
  }
}
