import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface PaginatedTransactions {
  data: any[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class TransactionHistoryService {
  private readonly logger = new Logger(TransactionHistoryService.name);

  constructor(private prisma: PrismaService) {}

  async getHistory(
    walletId: string,
    orgId: string,
    opts: { page: number; limit: number; type?: string },
  ): Promise<PaginatedTransactions> {
    const where: any = { walletId };
    if (opts.type) where.type = opts.type;

    const [data, total] = await Promise.all([
      this.prisma.mpcTransaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (opts.page - 1) * opts.limit,
        take: opts.limit,
      }),
      this.prisma.mpcTransaction.count({ where }),
    ]);

    return {
      data,
      total,
      page: opts.page,
      limit: opts.limit,
      totalPages: Math.ceil(total / opts.limit),
    };
  }

  async getRecentTransactions(walletId: string, limit = 20) {
    return this.prisma.mpcTransaction.findMany({
      where: { walletId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async getTxCount(walletId: string): Promise<number> {
    return this.prisma.mpcTransaction.count({ where: { walletId } });
  }
}
