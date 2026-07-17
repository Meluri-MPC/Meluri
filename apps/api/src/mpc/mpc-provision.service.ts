import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { MpcClientService } from './mpc-client.service';
import { publicKeyToAddress } from '@stacks/transactions';
import * as crypto from 'crypto';

// ─── KMS envelope stored in DB ────────────────────────────────────────────

interface EncryptedShareBlob {
  ciphertext: string; // base64 AES-256-GCM
  iv: string;         // base64
  tag: string;        // base64
  salt: string;       // base64 HKDF salt
  kmsKeyId: string;   // identifier of the key used
  version: number;    // envelope version for future migration
}

@Injectable()
export class MpcProvisionService implements OnModuleInit {
  private readonly logger = new Logger(MpcProvisionService.name);
  private encryptionKey!: Buffer; // 32-byte AES-256 key

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly mpcClient: MpcClientService,
  ) {}

  onModuleInit(): void {
    const keyHex = this.config.get<string>('ENCRYPTION_KEY');
    if (!keyHex) {
      // Startup guard — prevents silent zero-key encryption
      throw new Error(
        'ENCRYPTION_KEY environment variable is required (64 hex characters). ' +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
      );
    }
    if (keyHex.length !== 64 || !/^[0-9a-fA-F]+$/.test(keyHex)) {
      throw new Error('ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)');
    }
    this.encryptionKey = Buffer.from(keyHex, 'hex');
    this.logger.log('Share encryption key loaded');
  }

  // ─── Provisioning ──────────────────────────────────────────────────────

  async provisionMpcOrg(
    apiKeyId: string,
    appName: string,
    allowedDomains: string[],
    sponsorFees = false,
    relayerUrl?: string,
  ) {
    const existing = await this.prisma.mpcOrganization.findUnique({ where: { apiKeyId } });
    if (existing) return existing;

    const walletId = crypto.randomUUID();
    const tenantId = `tenant_${apiKeyId}`;

    // Run DKG on the MPC service
    const dkgResult = await this.mpcClient.initiateDkg(walletId, tenantId);

    const org = await this.prisma.mpcOrganization.create({
      data: {
        apiKeyId,
        turnkeyOrgId: `mpc-native-${walletId}`,
        appName,
        allowedDomains,
        sponsorFees,
        relayerUrl: relayerUrl ?? null,
      },
    });

    // Derive Stacks address using the official @stacks/transactions helper
    const stxAddress = publicKeyToAddress(dkgResult.publicKey, 'testnet');

    const wallet = await this.prisma.mpcWallet.create({
      data: {
        id: walletId,
        orgId: org.id,
        userId: tenantId,
        label: `${appName}-default`,
        stxAddress,
        publicKey: dkgResult.publicKey,
        // turnkeyWalletId repurposed as mpc-native wallet identifier
        turnkeyWalletId: `mpc-native-wallet-${walletId}`,
        network: 'testnet',
      },
    });

    // Encrypt and store each key share
    for (const share of dkgResult.shares) {
      const holderId =
        share.partyId === 1 ? 'client'
        : share.partyId === 2 ? 'server-s1'
        : 'server-s2';

      const encryptedBlob = this.encryptShare(
        share.share,
        `wallet:${walletId}:share:${share.partyId}`,
      );

      await this.prisma.keyShare.create({
        data: {
          walletId: wallet.id,
          orgId: org.id,
          shareIndex: share.partyId,
          holderId,
          encryptedShare: JSON.stringify(encryptedBlob),
          encryptionKeyId: 'local-aes256',
          publicKey: dkgResult.publicKey,
          dkgSessionId: walletId,
        },
      });
    }

    this.logger.log(
      `MPC org provisioned: orgId=${org.id}, walletId=${wallet.id}, stxAddress=${stxAddress}`,
    );

    return org;
  }

  // ─── Share Encryption / Decryption ─────────────────────────────────────

  /**
   * Encrypt a share value using AES-256-GCM with a unique IV and HKDF-derived key.
   * The `context` binds the derived key to this specific wallet+share, preventing
   * share substitution attacks.
   */
  private encryptShare(shareValue: string, context: string): EncryptedShareBlob {
    const iv = crypto.randomBytes(12);
    const salt = crypto.randomBytes(32);

    // Derive a unique key per share: HKDF(masterKey, salt, context)
    const derivedKey = crypto.hkdfSync('sha256', this.encryptionKey, salt, context, 32);

    const cipher = crypto.createCipheriv('aes-256-gcm', derivedKey, iv);
    const ciphertext = Buffer.concat([
      cipher.update(shareValue, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    // Wipe derived key from memory
    Buffer.from(derivedKey).fill(0);

    return {
      ciphertext: ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      salt: salt.toString('base64'),
      kmsKeyId: 'local-aes256',
      version: 1,
    };
  }

  /**
   * Decrypt a share. Accepts JSON string or already-parsed blob.
   */
  decryptShare(encryptedShareJson: string, context: string): string {
    const blob: EncryptedShareBlob = JSON.parse(encryptedShareJson);

    const iv = Buffer.from(blob.iv, 'base64');
    const tag = Buffer.from(blob.tag, 'base64');
    const ciphertext = Buffer.from(blob.ciphertext, 'base64');
    const salt = Buffer.from(blob.salt, 'base64');

    const derivedKey = crypto.hkdfSync('sha256', this.encryptionKey, salt, context, 32);

    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', derivedKey, iv);
      decipher.setAuthTag(tag);
      const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      Buffer.from(derivedKey).fill(0);
      return plaintext.toString('utf8');
    } catch {
      Buffer.from(derivedKey).fill(0);
      throw new Error('Share decryption failed — wrong key, corrupted data, or tampered blob');
    }
  }
}
