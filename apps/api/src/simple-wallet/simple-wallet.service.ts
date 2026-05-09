import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RelayerService } from '../relayer/relayer.service';
import * as secp from '@noble/secp256k1';
import {
  makeUnsignedSTXTokenTransfer,
  publicKeyToAddress,
  TransactionSigner,
  privateKeyToPublic,
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
    const pubKey = Buffer.from(privateKeyToPublic(privKey)).toString('hex');
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
      sponsored: true,
    });

    const signer = new TransactionSigner(tx);
    signer.signOrigin(wallet.privateKey);
    const signedHex = tx.serialize();

    const result = await this.relayer.sponsorTransaction(signedHex, {
      network: wallet.network as 'mainnet' | 'testnet',
    });

    this.logger.log(`TX sent: ${result.txid}`);
    return { txid: result.txid, status: result.status };
  }
}
