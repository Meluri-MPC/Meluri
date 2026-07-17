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

// AES-256-GCM envelope used to protect the RSA private key in Redis
interface EncryptedKeyPair {
  ciphertext: string; // base64
  iv: string;         // base64
  tag: string;        // base64
  publicKey: string;  // PEM — public, safe in plaintext
  keyId: string;
}

const ALGORITHM = 'aes-256-gcm' as const;
const KEYPAIR_REDIS_KEY = 'jwt:keypair:v2';

@Injectable()
export class TokenService implements OnModuleInit {
  private readonly logger = new Logger(TokenService.name);
  private keyPair: KeyPair | null = null;
  private publicJwk: Record<string, any> | null = null;
  private fallbackStore: Map<string, string> = new Map();
  /** AES-256 key derived from ENCRYPTION_KEY env var, used to protect JWT private key in Redis */
  private readonly aesKey: Buffer;

  private readonly accessTokenExpiry = '15m';
  private readonly accessTokenExpiryMs = 15 * 60 * 1000;
  private readonly refreshTokenExpiryMs = 7 * 24 * 60 * 60 * 1000;

  constructor(@Inject(REDIS_CLIENT) private redis: Redis | null) {
    // Derive a key specifically for JWT keypair encryption using HKDF so it is
    // independent from the share-encryption key even if both use ENCRYPTION_KEY.
    const root = process.env.ENCRYPTION_KEY ?? '';
    if (!root || root.length !== 64) {
      throw new Error(
        'ENCRYPTION_KEY (64 hex chars) is required to protect JWT signing keys',
      );
    }
    this.aesKey = Buffer.from(
      crypto.hkdfSync('sha256', Buffer.from(root, 'hex'), Buffer.alloc(0), 'jwt-keypair-v1', 32),
    );
  }

  async onModuleInit() {
    await this.loadOrGenerateKeys();
  }

  // ─── Redis helpers ────────────────────────────────────────────────────────

  private get redisAvailable(): boolean {
    return this.redis !== null && this.redis.status === 'ready';
  }

  private async redisGet(key: string): Promise<string | null> {
    if (this.redisAvailable) return this.redis!.get(key);
    this.cleanupFallbackStore();
    return this.fallbackStore.get(key) ?? null;
  }

  /**
   * Atomic SET with TTL — avoids the non-atomic SET + EXPIRE race.
   */
  private async redisSet(key: string, value: string, ttlMs?: number): Promise<void> {
    if (this.redisAvailable) {
      if (ttlMs && ttlMs > 0) {
        await this.redis!.set(key, value, 'PX', ttlMs);
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
    const prefix = pattern.replace('*', '');
    return Array.from(this.fallbackStore.keys()).filter((k) => k.startsWith(prefix));
  }

  private cleanupFallbackStore(): void {
    const maxEntries = 10_000;
    if (this.fallbackStore.size > maxEntries) {
      const keys = Array.from(this.fallbackStore.keys());
      for (let i = 0; i < keys.length - maxEntries; i++) {
        this.fallbackStore.delete(keys[i]);
      }
    }
  }

  // ─── Key lifecycle ────────────────────────────────────────────────────────

  private async loadOrGenerateKeys(): Promise<void> {
    const stored = await this.redisGet(KEYPAIR_REDIS_KEY);
    if (stored) {
      try {
        const privateKeyPem = this.decryptKeyPair(JSON.parse(stored));
        const envelope: EncryptedKeyPair = JSON.parse(stored);
        this.keyPair = {
          privateKey: privateKeyPem,
          publicKey: envelope.publicKey,
          keyId: envelope.keyId,
        };
        this.publicJwk = await this.exportJwk(envelope.publicKey, envelope.keyId);
        this.logger.log(`Loaded existing JWT key pair (kid: ${envelope.keyId})`);
        return;
      } catch (err) {
        this.logger.warn(`Failed to decrypt stored JWT key pair, regenerating: ${err}`);
      }
    }

    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    const keyId = crypto.randomBytes(8).toString('hex');
    this.keyPair = { privateKey, publicKey, keyId };

    // Encrypt private key before storing in Redis
    const envelope = this.encryptKeyPair(privateKey, publicKey, keyId);
    await this.redisSet(KEYPAIR_REDIS_KEY, JSON.stringify(envelope));

    this.publicJwk = await this.exportJwk(publicKey, keyId);
    this.logger.log(
      `Generated new JWT key pair (kid: ${keyId})${this.redisAvailable ? '' : ' [in-memory fallback]'}`,
    );
  }

  private encryptKeyPair(privateKeyPem: string, publicKeyPem: string, keyId: string): EncryptedKeyPair {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGORITHM, this.aesKey, iv);
    const ciphertext = Buffer.concat([
      cipher.update(privateKeyPem, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return {
      ciphertext: ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      publicKey: publicKeyPem,
      keyId,
    };
  }

  private decryptKeyPair(envelope: EncryptedKeyPair): string {
    const iv = Buffer.from(envelope.iv, 'base64');
    const tag = Buffer.from(envelope.tag, 'base64');
    const ciphertext = Buffer.from(envelope.ciphertext, 'base64');
    const decipher = crypto.createDecipheriv(ALGORITHM, this.aesKey, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  }

  private async exportJwk(publicKeyPem: string, keyId: string): Promise<Record<string, any>> {
    const key = await jose.importSPKI(publicKeyPem, 'RS256');
    const jwk = await jose.exportJWK(key);
    jwk.kid = keyId;
    jwk.use = 'sig';
    jwk.alg = 'RS256';
    return jwk;
  }

  // ─── Token issuance & verification ───────────────────────────────────────

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
      JSON.stringify({ sub: payload.sub, email: payload.email, name: payload.name, provider: payload.provider, jti }),
      this.refreshTokenExpiryMs,
    );

    return { accessToken, refreshToken, expiresIn: this.accessTokenExpiryMs };
  }

  async verifyAccessToken(token: string): Promise<TokenPayload | null> {
    if (!this.keyPair) throw new Error('Key pair not initialized');
    try {
      return jwt.verify(token, this.keyPair.publicKey, {
        algorithms: ['RS256'],
        issuer: 'velumx',
      }) as TokenPayload;
    } catch {
      return null;
    }
  }

  async refreshAccessToken(refreshToken: string): Promise<TokenPair | null> {
    const stored = await this.redisGet(`refresh:${refreshToken}`);
    if (!stored) return null;

    const data = JSON.parse(stored);
    // Rotate: delete old token before issuing new one
    await this.redisDel(`refresh:${refreshToken}`);

    return this.issueTokens({
      sub: data.sub,
      email: data.email,
      name: data.name ?? '',
      provider: data.provider ?? '',
    });
  }

  async revokeRefreshToken(refreshToken: string): Promise<void> {
    await this.redisSet(`revoked:${refreshToken}`, '1', this.refreshTokenExpiryMs);
    await this.redisDel(`refresh:${refreshToken}`);
  }

  async isRefreshTokenRevoked(refreshToken: string): Promise<boolean> {
    return (await this.redisGet(`revoked:${refreshToken}`)) !== null;
  }

  async revokeAllUserSessions(sub: string): Promise<void> {
    const keys = await this.redisKeys('refresh:*');
    await Promise.all(
      keys.map(async (key) => {
        const stored = await this.redisGet(key);
        if (!stored) return;
        const data = JSON.parse(stored);
        if (data.sub === sub) {
          const token = key.replace('refresh:', '');
          await this.redisSet(`revoked:${token}`, '1', this.refreshTokenExpiryMs);
          await this.redisDel(key);
        }
      }),
    );
  }

  getPublicJwk(): Record<string, any> | null {
    return this.publicJwk;
  }

  getKeyId(): string | null {
    return this.keyPair?.keyId ?? null;
  }
}
