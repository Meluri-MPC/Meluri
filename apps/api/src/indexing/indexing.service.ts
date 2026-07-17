import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class IndexingService {
  private readonly logger = new Logger(IndexingService.name);
  private readonly hiroBase: string;
  private readonly hiroApiKey: string | undefined;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.hiroBase = this.config.get<string>('HIRO_API_URL', 'https://api.mainnet.hiro.so');
    this.hiroApiKey = this.config.get<string>('HIRO_API_KEY');
  }

  async syncBalances(walletId: string, stxAddress: string): Promise<void> {
    const data: any = await this.fetchWithRetry(
      `${this.hiroBase}/extended/v1/address/${stxAddress}/balances`,
    );

    // ── STX ──────────────────────────────────────────────────────────────
    const stxBalance = data.stx?.balance ?? '0';
    await this.prisma.mpcBalance.upsert({
      where: {
        walletId_assetType_contractAddress_tokenId: {
          walletId, assetType: 'STX', contractAddress: '', tokenId: '',
        },
      },
      update: { balance: stxBalance },
      create: {
        walletId, assetType: 'STX', symbol: 'STX',
        name: 'Stacks Token', decimals: 6, balance: stxBalance,
        contractAddress: '', tokenId: '',
      },
    });

    // ── Fungible Tokens ───────────────────────────────────────────────────
    const fts: Record<string, any> = data.fungible_tokens ?? {};
    for (const [principal, token] of Object.entries(fts)) {
      await this.prisma.mpcBalance.upsert({
        where: {
          walletId_assetType_contractAddress_tokenId: {
            walletId, assetType: 'FT', contractAddress: principal, tokenId: '',
          },
        },
        update: { balance: token.balance },
        create: {
          walletId, assetType: 'FT', contractAddress: principal,
          symbol: principal.split('::').pop()?.split('.').pop() ?? '???',
          name: principal, decimals: 6,
          balance: token.balance,
          tokenId: '',
        },
      });
    }

    // ── Non-Fungible Tokens ───────────────────────────────────────────────
    const nfts: Record<string, any> = data.non_fungible_tokens ?? {};
    for (const [principal, nft] of Object.entries(nfts)) {
      // Each entry can represent multiple token IDs; Hiro returns count not IDs here.
      // Store as a single balance row with count — detailed IDs need a separate endpoint.
      await this.prisma.mpcBalance.upsert({
        where: {
          walletId_assetType_contractAddress_tokenId: {
            walletId, assetType: 'NFT', contractAddress: principal, tokenId: '',
          },
        },
        update: { balance: String(nft.count ?? 0) },
        create: {
          walletId, assetType: 'NFT', contractAddress: principal,
          symbol: principal.split('::').pop()?.split('.').pop() ?? 'NFT',
          name: principal, decimals: 0,
          balance: String(nft.count ?? 0),
          tokenId: '',
        },
      });
    }

    await this.prisma.mpcWallet.update({
      where: { id: walletId },
      data: { lastSyncedAt: new Date() },
    });
  }

  async syncTransactions(walletId: string, stxAddress: string, limit = 50): Promise<void> {
    const data: any = await this.fetchWithRetry(
      `${this.hiroBase}/extended/v1/address/${stxAddress}/transactions?limit=${limit}`,
    );
    const txs: any[] = data.results ?? [];

    for (const tx of txs) {
      const exists = await this.prisma.mpcTransaction.findUnique({
        where: { walletId_txid: { walletId, txid: tx.tx_id } },
      });
      if (exists) {
        // Update status if it changed (pending → confirmed)
        if (exists.status !== (tx.tx_status === 'success' ? 'confirmed' : tx.tx_status)) {
          await this.prisma.mpcTransaction.update({
            where: { walletId_txid: { walletId, txid: tx.tx_id } },
            data: {
              status: tx.tx_status === 'success' ? 'confirmed' : tx.tx_status,
              blockHeight: tx.block_height ?? exists.blockHeight,
              confirmedAt: tx.tx_status === 'success' ? new Date() : null,
            },
          });
        }
        continue;
      }

      await this.prisma.mpcTransaction.create({
        data: {
          walletId,
          txid: tx.tx_id,
          type: tx.tx_type === 'token_transfer'
            ? 'STX_TRANSFER'
            : tx.tx_type?.toUpperCase() ?? 'UNKNOWN',
          fromAddress: tx.sender_address,
          toAddress: tx.token_transfer?.recipient_address ?? null,
          amount: tx.token_transfer?.amount ?? null,
          assetSymbol: tx.tx_type === 'token_transfer' ? 'STX' : null,
          assetPrincipal: tx.contract_call?.contract_id ?? null,
          status: tx.tx_status === 'success' ? 'confirmed' : tx.tx_status,
          blockHeight: tx.block_height ?? null,
          confirmedAt: tx.tx_status === 'success' ? new Date() : null,
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

  // ─── HTTP helper ──────────────────────────────────────────────────────────

  private async fetchWithRetry(url: string, retries = 3): Promise<unknown> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (this.hiroApiKey) {
      headers['x-api-key'] = this.hiroApiKey;
    }

    for (let i = 0; i < retries; i++) {
      try {
        const res = await fetch(url, { headers });
        if (!res.ok) throw new Error(`Hiro API HTTP ${res.status} for ${url}`);
        return res.json();
      } catch (err) {
        this.logger.warn(`Hiro fetch attempt ${i + 1}/${retries} failed: ${err}`);
        if (i === retries - 1) throw err;
        await new Promise((r) => setTimeout(r, 1000 * 2 ** i)); // exponential back-off
      }
    }
  }
}
