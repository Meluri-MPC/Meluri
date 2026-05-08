import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RelayerService } from '../relayer/relayer.service';
import * as secp from '@noble/secp256k1';
import {
  makeUnsignedSTXTokenTransfer,
  publicKeyToAddress,
} from '@stacks/transactions';
import { STACKS_TESTNET, STACKS_MAINNET } from '@stacks/network';
import * as crypto from 'crypto';

secp.etc.hmacSha256Sync = (key: Uint8Array, ...msgs: Uint8Array[]) => {
  const h = crypto.createHmac('sha256', Buffer.from(key));
  for (const msg of msgs) h.update(Buffer.from(msg));
  return h.digest();
};

@Injectable()
export class SimpleWalletService {
  private readonly logger = new Logger(SimpleWalletService.name);

  constructor(
    private prisma: PrismaService,
    private relayer: RelayerService,
  ) {}

  async createWallet(userId: string, network: 'mainnet' | 'testnet' = 'testnet') {
    const existing = await this.prisma.simpleWallet.findUnique({ where: { userId } });
    if (existing) return { stxAddress: existing.stxAddress, publicKey: existing.publicKey };

    const privKey = crypto.randomBytes(32).toString('hex');
    const pubKey = Buffer.from(secp.getPublicKey(privKey, true)).toString('hex');
    const stxAddress = publicKeyToAddress(pubKey, network === 'mainnet' ? 'mainnet' : 'testnet');

    await this.prisma.simpleWallet.create({
      data: { userId, stxAddress, publicKey: pubKey, privateKey: privKey, network },
    });

    this.logger.log(`Wallet created for ${userId}: ${stxAddress}`);
    return { stxAddress, publicKey: pubKey };
  }

  async getWallet(userId: string) {
    const wallet = await this.prisma.simpleWallet.findUnique({ where: { userId } });
    if (!wallet) return null;
    return {
      userId,
      stxAddress: wallet.stxAddress,
      publicKey: wallet.publicKey,
      network: wallet.network,
      createdAt: wallet.createdAt,
    };
  }

  async sendStx(userId: string, recipient: string, amount: number) {
    const wallet = await this.prisma.simpleWallet.findUnique({ where: { userId } });
    if (!wallet) throw new Error('Wallet not found');

    const network = wallet.network === 'mainnet' ? STACKS_MAINNET : STACKS_TESTNET;

    const tx = await makeUnsignedSTXTokenTransfer({
      recipient,
      amount: BigInt(amount),
      memo: '',
      publicKey: wallet.publicKey,
      network: network as any,
      fee: 0n,
      sponsored: true,
    });

    const sigHash = tx.signBegin();
    tx.signNextOrigin(sigHash, wallet.privateKey);
    const signedHex = tx.serialize();

    // Try broadcasting directly to Stacks testnet first (bypass VelumX for debugging)
    try {
      const bn = await fetch('https://api.testnet.hiro.so/v2/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tx: signedHex, attachment: '0x' }),
      });
      const bnResult = await bn.json();
      if (bn.ok) {
        this.logger.log(`Direct broadcast: ${bnResult}`);
        const bnTxid = typeof bnResult === 'string' ? bnResult : (bnResult as any).txid || JSON.stringify(bnResult);
        return { txid: bnTxid, status: 'broadcast' };
      }
      this.logger.warn(`Direct broadcast failed: ${JSON.stringify(bnResult)}`);
    } catch (e: any) {
      this.logger.warn(`Direct broadcast error: ${e.message}`);
    }

    // Fallback to VelumX
    const result = await this.relayer.sponsorTransaction(signedHex, {
      userId,
      network: wallet.network as 'mainnet' | 'testnet',
    });

    this.logger.log(`TX sent: ${result.txid}`);
    return { txid: result.txid, status: result.status };
  }
}
