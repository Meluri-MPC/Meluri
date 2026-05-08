import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class IndexingService {
  private readonly logger = new Logger(IndexingService.name);
  private readonly hiroBase: string;

  constructor(private config: ConfigService, private prisma: PrismaService) {
    this.hiroBase = this.config.get<string>('HIRO_API_URL', 'https://api.mainnet.hiro.so');
  }

  async syncBalances(walletId: string, stxAddress: string): Promise<void> {
    const data = await this.fetchWithRetry(`${this.hiroBase}/extended/v1/address/${stxAddress}/balances`);

    // STX
    const stxBalance = (data as any).stx?.balance ?? '0';
    await this.prisma.mpcBalance.upsert({
      where: { walletId_assetType_contractAddress_tokenId: { walletId, assetType: 'STX', contractAddress: '', tokenId: '' } },
      update: { balance: stxBalance },
      create: { walletId, assetType: 'STX', symbol: 'STX', name: 'Stacks Token', decimals: 6, balance: stxBalance, contractAddress: '', tokenId: '' },
    });

    // FTs
    const fts = (data as any).fungible_tokens ?? {};
    for (const [principal, token] of Object.entries<any>(fts)) {
      await this.prisma.mpcBalance.upsert({
        where: { walletId_assetType_contractAddress_tokenId: { walletId, assetType: 'FT', contractAddress: principal, tokenId: '' } },
        update: { balance: token.balance },
        create: {
          walletId, assetType: 'FT', contractAddress: principal,
          symbol: principal.split('.').pop() ?? '???', name: principal, decimals: 6,
          balance: token.balance,
        },
      });
    }

    await this.prisma.mpcWallet.update({ where: { id: walletId }, data: { lastSyncedAt: new Date() } });
  }

  async syncTransactions(walletId: string, stxAddress: string, limit = 50): Promise<void> {
    const data = await this.fetchWithRetry(
      `${this.hiroBase}/extended/v1/address/${stxAddress}/transactions?limit=${limit}`,
    );
    const txs = (data as any).results ?? [];

    for (const tx of txs) {
      const exists = await this.prisma.mpcTransaction.findUnique({
        where: { walletId_txid: { walletId, txid: tx.tx_id } },
      });
      if (exists) continue;

      await this.prisma.mpcTransaction.create({
        data: {
          walletId, txid: tx.tx_id,
          type: tx.tx_type === 'token_transfer' ? 'STX_TRANSFER' : tx.tx_type?.toUpperCase() ?? 'UNKNOWN',
          fromAddress: tx.sender_address,
          toAddress: tx.token_transfer?.recipient_address ?? null,
          amount: tx.token_transfer?.amount ?? null,
          assetPrincipal: tx.contract_call?.contract_id ?? null,
          status: tx.tx_status === 'success' ? 'confirmed' : tx.tx_status,
          blockHeight: tx.block_height,
        },
      });
    }
  }

  async syncWallet(walletId: string, stxAddress: string): Promise<void> {
    await Promise.all([
      this.syncBalances(walletId, stxAddress),
      this.syncTransactions(walletId, stxAddress),
    ]);
  }

  private async fetchWithRetry(url: string, retries = 3): Promise<unknown> {
    for (let i = 0; i < retries; i++) {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      } catch (err) {
        if (i === retries - 1) throw err;
        await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
      }
    }
  }
}
