import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MpcClientService } from './mpc-client.service';
import * as crypto from 'crypto';

@Injectable()
export class MpcProvisionService {
  private readonly logger = new Logger(MpcProvisionService.name);

  constructor(
    private prisma: PrismaService,
    private mpcClient: MpcClientService,
  ) {}

  async provisionMpcOrg(apiKeyId: string, appName: string, allowedDomains: string[]) {
    const existing = await this.prisma.mpcOrganization.findUnique({ where: { apiKeyId } });
    if (existing) return existing;

    const walletId = crypto.randomUUID();
    const tenantId = `tenant_${apiKeyId}`;

    const dkgResult = await this.mpcClient.initiateDkg(walletId, tenantId);

    const org = await this.prisma.mpcOrganization.create({
      data: {
        apiKeyId,
        turnkeyOrgId: `mpc-native-${walletId}`,
        appName,
        allowedDomains,
      },
    });

    const stxAddress = this.deriveStacksAddress(dkgResult.publicKey);

    const wallet = await this.prisma.mpcWallet.create({
      data: {
        id: walletId,
        orgId: org.id,
        userId: tenantId,
        label: `${appName}-default`,
        stxAddress,
        publicKey: dkgResult.publicKey,
        turnkeyWalletId: `mpc-native-wallet-${walletId}`,
        network: 'testnet',
      },
    });

    for (const share of dkgResult.shares) {
      const holderId = share.partyId === 1 ? 'client'
        : share.partyId === 2 ? 'server-s1'
        : 'server-s2';

      await this.prisma.keyShare.create({
        data: {
          walletId: wallet.id,
          orgId: org.id,
          shareIndex: share.partyId,
          holderId,
          encryptedShare: this.encryptShare(share.share),
          encryptionKeyId: 'local-dev',
          publicKey: dkgResult.publicKey,
          dkgSessionId: walletId,
        },
      });
    }

    this.logger.log(
      `MPC org provisioned: orgId=${org.id}, walletId=${wallet.id}, address=${stxAddress}`,
    );

    return org;
  }

  private encryptShare(share: string): string {
    const key = process.env.ENCRYPTION_KEY ?? '0'.repeat(64);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
    const encrypted = Buffer.concat([cipher.update(share, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, encrypted, authTag]).toString('base64');
  }

  private deriveStacksAddress(publicKeyHex: string): string {
    const pubkey = Buffer.from(publicKeyHex, 'hex');
    const hash0 = crypto.createHash('sha256').update(pubkey).digest();
    const hash1 = crypto.createHash('rmd160').update(hash0).digest();
    const versioned = Buffer.concat([Buffer.from([0x16]), hash1]);
    const checksum = crypto.createHash('sha256')
      .update(crypto.createHash('sha256').update(versioned).digest())
      .digest()
      .subarray(0, 4);
    const address = Buffer.concat([versioned, checksum]);
    return this.base58CheckEncode(address);
  }

  private base58CheckEncode(data: Buffer): string {
    const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let num = 0n;
    for (const byte of data) {
      num = (num << 8n) | BigInt(byte);
    }
    let result = '';
    while (num > 0n) {
      const rem = Number(num % 58n);
      num = num / 58n;
      result = ALPHABET[rem] + result;
    }
    for (const byte of data) {
      if (byte === 0) result = '1' + result;
      else break;
    }
    return 'SP' + result;
  }
}
