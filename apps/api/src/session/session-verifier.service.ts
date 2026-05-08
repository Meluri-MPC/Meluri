import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';

@Injectable()
export class SessionVerifierService {
  private readonly logger = new Logger(SessionVerifierService.name);

  constructor(private prisma: PrismaService) {}

  async verifyDelegation(delegationJson: string, expectedAddress: string): Promise<{ valid: boolean; reason?: string }> {
    let delegation: any;
    try { delegation = JSON.parse(delegationJson); } catch {
      return { valid: false, reason: 'Invalid delegation format' };
    }

    if (!delegation.walletPublicKey || !delegation.sessionPublicKey || !delegation.signature) {
      return { valid: false, reason: 'Missing required delegation fields' };
    }

    if (Date.now() > delegation.expiresAt) {
      return { valid: false, reason: 'Session expired' };
    }

    if (delegation.walletAddress !== expectedAddress) {
      return { valid: false, reason: 'Wallet address mismatch' };
    }

    const wallet = await this.prisma.mpcWallet.findFirst({ where: { stxAddress: expectedAddress } });
    if (!wallet) return { valid: false, reason: 'Wallet not registered' };
    if (wallet.publicKey !== delegation.walletPublicKey) return { valid: false, reason: 'Public key mismatch' };

    const message = JSON.stringify({
      action: 'meluri-mpc-session-delegation',
      sessionPublicKey: delegation.sessionPublicKey,
      walletPublicKey: delegation.walletPublicKey,
      walletAddress: delegation.walletAddress,
      expiresAt: delegation.expiresAt,
      nonce: delegation.nonce,
    });

    const msgHash = crypto.createHash('sha256').update(message).digest();

    try {
      const { verify, Signature } = require('@noble/secp256k1');
      const r = Buffer.from((delegation.signature.r ?? '').replace(/^0x/, ''), 'hex');
      const s = Buffer.from((delegation.signature.s ?? '').replace(/^0x/, ''), 'hex');
      const sig = new Signature(r, s);
      const valid = verify(sig, msgHash, delegation.walletPublicKey);
      if (!valid) return { valid: false, reason: 'Invalid delegation signature' };
    } catch (err) {
      this.logger.error(`Sig verification failed: ${err}`);
      return { valid: false, reason: 'Signature verification error' };
    }

    return { valid: true };
  }
}
