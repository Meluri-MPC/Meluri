import { Injectable, Logger, Inject, OnModuleInit } from '@nestjs/common';
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';
import * as jose from 'jose';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface TokenPayload {
  sub: string;
  email: string;
  name: string;
  provider: string;
  avatarUrl?: string;
  iat?: number;
  exp?: number;
}

interface KeyPair {
  privateKey: string;
  publicKey: string;
  keyId: string;
}

@Injectable()
export class TokenService implements OnModuleInit {
  private readonly logger = new Logger(TokenService.name);
  private keyPair: KeyPair | null = null;
  private publicJwk: Record<string, any> | null = null;
  private fallbackStore: Map<string, string> = new Map();

  private readonly accessTokenExpiry = '15m';
  private readonly accessTokenExpiryMs = 15 * 60 * 1000;
  private readonly refreshTokenExpiry = '7d';
  private readonly refreshTokenExpiryMs = 7 * 24 * 60 * 60 * 1000;

  constructor(@Inject(REDIS_CLIENT) private redis: Redis | null) {}

  async onModuleInit() {
    await this.loadOrGenerateKeys();
  }

  private get redisAvailable(): boolean {
    return this.redis !== null && this.redis.status === 'ready';
  }

  private async redisGet(key: string): Promise<string | null> {
    if (this.redisAvailable) return this.redis!.get(key);
    this.cleanupFallbackStore();
    return this.fallbackStore.get(key) ?? null;
  }

  private async redisSet(key: string, value: string, mode?: string, ttl?: number): Promise<void> {
    if (this.redisAvailable) {
      if (mode === 'PX') {
        await this.redis!.set(key, value);
        await this.redis!.pexpire(key, ttl ?? 0);
      } else if (mode === 'EX') {
        await this.redis!.set(key, value);
        await this.redis!.expire(key, ttl ?? 0);
      } else {
        await this.redis!.set(key, value);
      }
    } else {
      this.fallbackStore.set(key, value);
    }
  }

  private async redisDel(key: string): Promise<void> {
    if (this.redisAvailable) {
      await this.redis!.del(key);
    } else {
      this.fallbackStore.delete(key);
    }
  }

  private async redisKeys(pattern: string): Promise<string[]> {
    if (this.redisAvailable) return this.redis!.keys(pattern);
    const keys: string[] = [];
    const prefix = pattern.replace('*', '');
    for (const key of this.fallbackStore.keys()) {
      if (key.startsWith(prefix)) keys.push(key);
    }
    return keys;
  }

  private cleanupFallbackStore(): void {
    const maxEntries = 10000;
    if (this.fallbackStore.size > maxEntries) {
      const keys = Array.from(this.fallbackStore.keys());
      for (let i = 0; i < keys.length - maxEntries; i++) {
        this.fallbackStore.delete(keys[i]);
      }
    }
  }

  private async loadOrGenerateKeys() {
    const stored = await this.redisGet('jwt:keypair');
    if (stored) {
      const parsed = JSON.parse(stored);
      this.keyPair = parsed;
      this.publicJwk = await this.exportJwk(parsed.publicKey, parsed.keyId);
      this.logger.log(`Loaded existing JWT key pair (kid: ${parsed.keyId})`);
      return;
    }

    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    const keyId = crypto.randomBytes(8).toString('hex');
    this.keyPair = { privateKey, publicKey, keyId };

    await this.redisSet('jwt:keypair', JSON.stringify(this.keyPair));
    this.publicJwk = await this.exportJwk(publicKey, keyId);
    this.logger.log(`Generated new JWT key pair (kid: ${keyId})${this.redisAvailable ? '' : ' [in-memory fallback]'}`);
  }

  private async exportJwk(publicKeyPem: string, keyId: string): Promise<Record<string, any>> {
    const key = await jose.importSPKI(publicKeyPem, 'RS256');
    const jwk = await jose.exportJWK(key);
    jwk.kid = keyId;
    jwk.use = 'sig';
    jwk.alg = 'RS256';
    return jwk;
  }

  async issueTokens(payload: TokenPayload): Promise<TokenPair> {
    if (!this.keyPair) throw new Error('Key pair not initialized');

    const tokenPayload = { ...payload };
    delete (tokenPayload as any).iat;
    delete (tokenPayload as any).exp;

    const accessToken = jwt.sign(tokenPayload, this.keyPair.privateKey, {
      algorithm: 'RS256',
      expiresIn: this.accessTokenExpiry,
      keyid: this.keyPair.keyId,
      issuer: 'velumx',
      subject: payload.sub,
    });

    const refreshToken = crypto.randomBytes(48).toString('hex');
    const jti = crypto.randomBytes(16).toString('hex');

    await this.redisSet(
      `refresh:${refreshToken}`,
      JSON.stringify({ sub: payload.sub, email: payload.email, jti }),
      'PX',
      this.refreshTokenExpiryMs,
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: this.accessTokenExpiryMs,
    };
  }

  async verifyAccessToken(token: string): Promise<TokenPayload | null> {
    if (!this.keyPair) throw new Error('Key pair not initialized');

    try {
      const decoded = jwt.verify(token, this.keyPair.publicKey, {
        algorithms: ['RS256'],
        issuer: 'velumx',
      }) as TokenPayload;
      return decoded;
    } catch {
      return null;
    }
  }

  async refreshAccessToken(refreshToken: string): Promise<TokenPair | null> {
    const stored = await this.redisGet(`refresh:${refreshToken}`);
    if (!stored) return null;

    const data = JSON.parse(stored);
    await this.redisDel(`refresh:${refreshToken}`);

    return this.issueTokens({
      sub: data.sub,
      email: data.email,
      name: '',
      provider: '',
    });
  }

  async revokeRefreshToken(refreshToken: string): Promise<void> {
    await this.redisSet(`revoked:${refreshToken}`, '1', 'PX', this.refreshTokenExpiryMs);
    await this.redisDel(`refresh:${refreshToken}`);
  }

  async isRefreshTokenRevoked(refreshToken: string): Promise<boolean> {
    const result = await this.redisGet(`revoked:${refreshToken}`);
    return result !== null;
  }

  async revokeAllUserSessions(sub: string): Promise<void> {
    const keys = await this.redisKeys('refresh:*');
    for (const key of keys) {
      const stored = await this.redisGet(key);
      if (stored) {
        const data = JSON.parse(stored);
        if (data.sub === sub) {
          const token = key.replace('refresh:', '');
          await this.redisSet(`revoked:${token}`, '1', 'PX', this.refreshTokenExpiryMs);
          await this.redisDel(key);
        }
      }
    }
  }

  getPublicJwk(): Record<string, any> | null {
    return this.publicJwk;
  }

  getKeyId(): string | null {
    return this.keyPair?.keyId ?? null;
  }
}
