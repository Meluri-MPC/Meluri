import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';
import * as secp from '@noble/secp256k1';

// Track used nonces to prevent replay attacks.
// Key: `${walletAddress}:${nonce}`, Value: expiry timestamp
const usedNonces = new Map<string, number>();

/** Prune expired nonce entries every 5 minutes */
setInterval(() => {
  const now = Date.now();
  for (const [key, expiry] of usedNonces) {
    if (now > expiry) usedNonces.delete(key);
  }
}, 5 * 60 * 1000);

@Injectable()
export class SessionVerifierService {
  private readonly logger = new Logger(SessionVerifierService.name);

  constructor(private readonly prisma: PrismaService) {}

  async verifyDelegation(
    delegationJson: string,
    expectedAddress: string,
  ): Promise<{ valid: boolean; reason?: string }> {
    // 1. Parse
    let delegation: any;
    try {
      delegation = JSON.parse(delegationJson);
    } catch {
      return { valid: false, reason: 'Invalid delegation JSON' };
    }

    // 2. Required fields
    if (!delegation.walletPublicKey || !delegation.sessionPublicKey || !delegation.signature) {
      return { valid: false, reason: 'Missing required delegation fields' };
    }
    if (typeof delegation.expiresAt !== 'number' || typeof delegation.nonce !== 'string') {
      return { valid: false, reason: 'Invalid delegation shape' };
    }

    // 3. Expiry
    if (Date.now() > delegation.expiresAt) {
      return { valid: false, reason: 'Session expired' };
    }

    // 4. Address match
    if (delegation.walletAddress !== expectedAddress) {
      return { valid: false, reason: 'Wallet address mismatch' };
    }

    // 5. Replay protection — reject reused nonces
    const nonceKey = `${expectedAddress}:${delegation.nonce}`;
    if (usedNonces.has(nonceKey)) {
      return { valid: false, reason: 'Delegation nonce already used (replay detected)' };
    }

    // 6. DB wallet lookup & public key consistency
    const wallet = await this.prisma.mpcWallet.findFirst({
      where: { stxAddress: expectedAddress },
    });
    if (!wallet) return { valid: false, reason: 'Wallet not registered' };
    if (wallet.publicKey !== delegation.walletPublicKey) {
      return { valid: false, reason: 'Public key mismatch' };
    }

    // 7. Verify ECDSA signature over delegation message
    const message = JSON.stringify({
      action: 'velumx-mpc-session-delegation',
      sessionPublicKey: delegation.sessionPublicKey,
      walletPublicKey: delegation.walletPublicKey,
      walletAddress: delegation.walletAddress,
      expiresAt: delegation.expiresAt,
      nonce: delegation.nonce,
    });
    const msgHash = crypto.createHash('sha256').update(message).digest();

    try {
      const { r: rHex, s: sHex } = delegation.signature;
      if (!rHex || !sHex) return { valid: false, reason: 'Malformed signature fields' };

      const r = BigInt('0x' + rHex.replace(/^0x/, ''));
      const s = BigInt('0x' + sHex.replace(/^0x/, ''));

      // secp256k1 v2 API
      const sig = new secp.Signature(r, s);
      const pubKeyBytes = Buffer.from(delegation.walletPublicKey, 'hex');
      const valid = secp.verify(sig, msgHash, pubKeyBytes);

      if (!valid) return { valid: false, reason: 'Invalid delegation signature' };
    } catch (err) {
      this.logger.error(`Signature verification error: ${err}`);
      return { valid: false, reason: 'Signature verification error' };
    }

    // 8. Record nonce as used (TTL = remaining session lifetime + 60s buffer)
    const ttl = delegation.expiresAt - Date.now() + 60_000;
    usedNonces.set(nonceKey, Date.now() + ttl);

    return { valid: true };
  }
}
