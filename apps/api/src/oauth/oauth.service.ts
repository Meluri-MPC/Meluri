import { Injectable, Logger, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TokenService } from '../token/token.service';
import { getProviderConfigs, OAuthProviderConfig, OAuthProfile } from './oauth-config';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';
import * as crypto from 'crypto';

@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);
  private readonly sessionDurationMs = 2 * 60 * 60 * 1000;
  private fallbackStore: Map<string, { value: string; expiresAt: number }> = new Map();

  constructor(
    private prisma: PrismaService,
    private tokenService: TokenService,
    @Inject(REDIS_CLIENT) private redis: Redis | null,
  ) {}

  private get redisAvailable(): boolean {
    return this.redis !== null && this.redis.status === 'ready';
  }

  private async redisGet(key: string): Promise<string | null> {
    if (this.redisAvailable) return this.redis!.get(key);
    const entry = this.fallbackStore.get(key);
    if (entry && Date.now() < entry.expiresAt) return entry.value;
    this.fallbackStore.delete(key);
    return null;
  }

  private async redisSet(key: string, value: string, mode?: string, ttlSec?: number): Promise<void> {
    if (this.redisAvailable) {
      await this.redis!.set(key, value);
      if (mode === 'EX' && ttlSec) await this.redis!.expire(key, ttlSec);
    } else {
      const expiresAt = ttlSec ? Date.now() + ttlSec * 1000 : Date.now() + 3600000;
      this.fallbackStore.set(key, { value, expiresAt });
    }
  }

  private async redisDel(key: string): Promise<void> {
    if (this.redisAvailable) await this.redis!.del(key);
    else this.fallbackStore.delete(key);
  }

  private async redisHset(key: string, fields: Record<string, string>): Promise<void> {
    if (this.redisAvailable) {
      await this.redis!.hset(key, fields);
      await this.redis!.expire(key, Math.floor(this.sessionDurationMs / 1000));
    }
  }

  getRedirectBase(): string {
    return process.env.OAUTH_REDIRECT_BASE ?? 'http://localhost:3001';
  }

  getProviders(): string[] {
    return ['google', 'github', 'discord', 'twitter', 'apple', 'email'];
  }

  async createState(provider: string): Promise<string> {
    const state = crypto.randomBytes(32).toString('hex');
    await this.redisSet(`csrf:${state}`, provider, 'EX', 300);
    return state;
  }

  async validateState(state: string, provider: string): Promise<boolean> {
    const stored = await this.redisGet(`csrf:${state}`);
    if (!stored) return false;
    await this.redisDel(`csrf:${state}`);
    return stored === provider;
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
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }> {
    const configs = getProviderConfigs(this.getRedirectBase());
    const config = configs[provider];
    if (!config) throw new Error(`Unknown provider: ${provider}`);

    const providerAccessToken = await this.exchangeCodeForToken(config, code);
    const userData = await this.fetchUserInfo(config, providerAccessToken);
    const profile = config.profileTransform(userData);

    const userId = `${provider}:${profile.providerUserId}`;

    const tokens = await this.tokenService.issueTokens({
      sub: userId,
      email: profile.email || '',
      name: profile.name || '',
      provider,
      avatarUrl: profile.avatarUrl,
    });

    const expiresAt = new Date(Date.now() + tokens.expiresIn);
    const sessionExpiresAt = new Date(Date.now() + this.sessionDurationMs);

    await this.prisma.oAuthSession.upsert({
      where: { sessionToken: tokens.refreshToken },
      update: {
        accessToken: providerAccessToken,
        tokenExpiresAt: new Date(Date.now() + 3600 * 1000),
        sessionExpiresAt,
      },
      create: {
        userId,
        provider,
        providerUserId: profile.providerUserId,
        email: profile.email,
        name: profile.name,
        avatarUrl: profile.avatarUrl,
        accessToken: providerAccessToken,
        sessionToken: tokens.refreshToken,
        sessionExpiresAt,
      },
    });

    await this.redisHset(`session:${userId}`, {
      email: profile.email ?? '',
      name: profile.name ?? '',
      provider,
      avatarUrl: profile.avatarUrl ?? '',
      lastLoginAt: new Date().toISOString(),
    });

    return { profile, ...tokens };
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

  async validateAccessToken(accessToken: string): Promise<{
    userId: string;
    email: string;
    name: string;
    avatarUrl?: string;
    provider: string;
  } | null> {
    const payload = await this.tokenService.verifyAccessToken(accessToken);
    if (!payload) return null;

    return {
      userId: payload.sub,
      email: payload.email,
      name: payload.name,
      avatarUrl: payload.avatarUrl,
      provider: payload.provider,
    };
  }

  async refreshSession(refreshToken: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  } | null> {
    const revoked = await this.tokenService.isRefreshTokenRevoked(refreshToken);
    if (revoked) return null;

    const tokens = await this.tokenService.refreshAccessToken(refreshToken);
    if (!tokens) return null;

    await this.prisma.oAuthSession.update({
      where: { sessionToken: refreshToken },
      data: {
        sessionToken: tokens.refreshToken,
        sessionExpiresAt: new Date(Date.now() + this.sessionDurationMs),
      },
    });

    return tokens;
  }

  async revokeSession(accessToken: string, refreshToken?: string): Promise<void> {
    if (refreshToken) {
      await this.tokenService.revokeRefreshToken(refreshToken);
      await this.prisma.oAuthSession.deleteMany({ where: { sessionToken: refreshToken } });
    }

    const payload = await this.tokenService.verifyAccessToken(accessToken);
    if (payload) {
      await this.redisDel(`session:${payload.sub}`);
      await this.tokenService.revokeAllUserSessions(payload.sub);
    }
  }

  // ─── Email Magic Link ────────────────────────────────────────────────

  async sendMagicLink(email: string): Promise<void> {
    const code = crypto.randomInt(100000, 999999).toString();
    const expiresAt = Date.now() + 15 * 60 * 1000;

    const key = `magic:${email.toLowerCase()}`;
    await this.redisSet(key, JSON.stringify({ code, expiresAt }), 'EX', 900);

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
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }> {
    const key = `magic:${email.toLowerCase()}`;
    const raw = await this.redisGet(key);
    if (!raw) throw new Error('No magic link code found for this email');

    const entry = JSON.parse(raw);
    if (Date.now() > entry.expiresAt) {
      await this.redisDel(key);
      throw new Error('Magic link code expired');
    }
    if (entry.code !== code) throw new Error('Invalid magic link code');

    await this.redisDel(key);

    const userId = `email:${email.toLowerCase()}`;
    const profile: OAuthProfile = {
      providerUserId: email.toLowerCase(),
      email,
      name: email.split('@')[0],
      provider: 'email',
    };

    const tokens = await this.tokenService.issueTokens({
      sub: userId,
      email: profile.email || '',
      name: profile.name || '',
      provider: 'email',
    });

    const sessionExpiresAt = new Date(Date.now() + this.sessionDurationMs);

    await this.prisma.oAuthSession.upsert({
      where: { sessionToken: tokens.refreshToken },
      update: { sessionExpiresAt },
      create: {
        userId,
        provider: 'email',
        providerUserId: email.toLowerCase(),
        email,
        name: email.split('@')[0],
        sessionToken: tokens.refreshToken,
        sessionExpiresAt,
      },
    });

    return { profile, ...tokens };
  }
}
