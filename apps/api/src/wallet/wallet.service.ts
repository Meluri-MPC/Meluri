import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWalletDto } from './dto/create-wallet.dto';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(private prisma: PrismaService) {}

  async create(orgId: string, dto: CreateWalletDto) {
    const wallet = await this.prisma.mpcWallet.create({
      data: {
        orgId,
        userId: dto.userId,
        stxAddress: dto.stxAddress,
        publicKey: dto.publicKey,
        turnkeyWalletId: dto.turnkeyWalletId ?? '',
        network: dto.network ?? 'mainnet',
      },
    });

    await this.prisma.mpcOrganization.update({
      where: { id: orgId },
      data: { walletCount: { increment: 1 } },
    });

    this.logger.log(`Wallet ${wallet.stxAddress} created for user ${dto.userId}`);
    return wallet;
  }

  async findByOrgAndAddress(orgId: string, stxAddress: string) {
    return this.prisma.mpcWallet.findFirst({ where: { orgId, stxAddress } });
  }

  async findByUserId(apiKeyId: string, userId: string) {
    const org = await this.prisma.mpcOrganization.findUnique({ where: { apiKeyId } });
    if (!org) return null;
    return this.prisma.mpcWallet.findFirst({ where: { orgId: org.id, userId } });
  }
}
