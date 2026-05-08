import { Controller, Get, Param, UseGuards, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiSecurity } from '@nestjs/swagger';
import { IndexingService } from './indexing.service';
import { WalletService } from '../wallet/wallet.service';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { ApiKey } from '../common/decorators/api-key.decorator';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('Indexing')
@ApiSecurity('x-api-key')
@Controller('wallets')
@UseGuards(ApiKeyGuard)
export class IndexingController {
  constructor(
    private indexing: IndexingService,
    private walletService: WalletService,
    private prisma: PrismaService,
  ) {}

  @Get(':address/assets')
  @ApiOperation({ summary: 'Get all assets for a wallet' })
  async getAssets(@ApiKey() apiKey: any, @Param('address') address: string) {
    const wallet = await this.walletService.findByOrgAndAddress(apiKey.mpcOrg?.id, address);
    if (!wallet) throw new NotFoundException('Wallet not found');

    await this.indexing.syncBalances(wallet.id, address);

    const balances = await this.prisma.mpcBalance.findMany({
      where: { walletId: wallet.id },
      orderBy: { assetType: 'asc' },
    });

    return {
      stx: balances.find((b) => b.assetType === 'STX') ?? null,
      tokens: balances.filter((b) => b.assetType === 'FT'),
      nfts: balances.filter((b) => b.assetType === 'NFT'),
    };
  }

  @Get(':address/transactions')
  @ApiOperation({ summary: 'Get transaction history' })
  async getTransactions(@ApiKey() apiKey: any, @Param('address') address: string) {
    const wallet = await this.walletService.findByOrgAndAddress(apiKey.mpcOrg?.id, address);
    if (!wallet) throw new NotFoundException('Wallet not found');

    await this.indexing.syncTransactions(wallet.id, address, 50);

    return {
      transactions: await this.prisma.mpcTransaction.findMany({
        where: { walletId: wallet.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    };
  }
}
