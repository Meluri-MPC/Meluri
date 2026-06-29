import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWalletDto } from './dto/create-wallet.dto';

const SOFT_DELETE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(private prisma: PrismaService) {}

  async create(orgId: string, dto: CreateWalletDto) {
    const label = dto.label || await this.generateLabel(orgId, dto.userId);

    const wallet = await this.prisma.mpcWallet.create({
      data: {
        orgId,
        userId: dto.userId,
        label,
        stxAddress: dto.stxAddress,
        publicKey: dto.publicKey,
        turnkeyWalletId: dto.turnkeyWalletId ?? '',
        derivationPath: dto.derivationPath ?? '',
        network: dto.network ?? 'mainnet',
      },
    });

    await this.prisma.mpcOrganization.update({
      where: { id: orgId },
      data: { walletCount: { increment: 1 } },
    });

    this.logger.log(`Wallet "${label}" (${wallet.stxAddress}) created for user ${dto.userId}`);
    return wallet;
  }

  async findById(orgId: string, id: string) {
    const wallet = await this.prisma.mpcWallet.findFirst({
      where: { id, orgId },
      include: { balances: true, transactions: { orderBy: { createdAt: 'desc' }, take: 10 } },
    });
    if (!wallet || wallet.deletedAt) return null;
    return wallet;
  }

  async findByOrgAndAddress(orgId: string, stxAddress: string) {
    const wallet = await this.prisma.mpcWallet.findFirst({
      where: { orgId, stxAddress },
    });
    if (!wallet || wallet.deletedAt) return null;
    return wallet;
  }

  async findByOrgAndUserId(orgId: string, userId: string) {
    const wallets = await this.prisma.mpcWallet.findMany({
      where: { orgId, userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return wallets;
  }

  async listWallets(
    orgId: string,
    opts: { userId?: string; page: number; limit: number },
  ) {
    const where: any = { orgId, deletedAt: null };
    if (opts.userId) where.userId = opts.userId;

    const [wallets, total] = await Promise.all([
      this.prisma.mpcWallet.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (opts.page - 1) * opts.limit,
        take: opts.limit,
        include: { balances: true },
      }),
      this.prisma.mpcWallet.count({ where }),
    ]);

    return {
      data: wallets,
      total,
      page: opts.page,
      limit: opts.limit,
      totalPages: Math.ceil(total / opts.limit),
    };
  }

  async updateLabel(id: string, label?: string) {
    return this.prisma.mpcWallet.update({
      where: { id },
      data: { label: label || null },
    });
  }

  async softDelete(id: string) {
    const wallet = await this.prisma.mpcWallet.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    try {
      await this.prisma.mpcOrganization.update({
        where: { id: wallet.orgId },
        data: { walletCount: { decrement: 1 } },
      });
    } catch {}

    this.logger.log(`Wallet ${id} soft-deleted`);
  }

  async hardDeleteExpired() {
    const cutoff = new Date(Date.now() - SOFT_DELETE_COOLDOWN_MS);
    const expired = await this.prisma.mpcWallet.findMany({
      where: { deletedAt: { lte: cutoff }, NOT: { deletedAt: null } },
    });

    for (const wallet of expired) {
      await this.prisma.mpcBalance.deleteMany({ where: { walletId: wallet.id } });
      await this.prisma.mpcTransaction.deleteMany({ where: { walletId: wallet.id } });
      await this.prisma.mpcWallet.delete({ where: { id: wallet.id } });
      this.logger.log(`Wallet ${wallet.id} permanently deleted`);
    }

    return { deleted: expired.length };
  }

  async exportShareBundle(orgId: string, walletId: string) {
    const shares = await (this.prisma as any).keyShare.findMany({
      where: { walletId, orgId, status: 'active' },
      orderBy: { shareIndex: 'asc' },
    });

    return {
      walletId,
      exportedAt: new Date().toISOString(),
      shareCount: shares.length,
      shares: (shares as any[]).map((s: any) => ({
        shareIndex: s.shareIndex,
        holderId: s.holderId,
        encryptedShare: s.encryptedShare,
        encryptionKeyId: s.encryptionKeyId,
        shareVersion: s.shareVersion,
      })),
    };
  }

  private async generateLabel(orgId: string, userId: string): Promise<string> {
    const count = await this.prisma.mpcWallet.count({
      where: { orgId, userId, deletedAt: null },
    });
    return `Wallet ${count + 1}`;
  }
}
