import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as crypto from 'crypto';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);

  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const rawKey = request.headers['x-api-key'] as string | undefined;

    if (!rawKey) throw new UnauthorizedException('Missing x-api-key header');

    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

    const apiKey = await this.prisma.apiKey.findUnique({
      where: { keyHash },
      include: { mpcOrg: true },
    });

    if (!apiKey) {
      await this.constantTimeDelay();
      throw new UnauthorizedException('Invalid API key');
    }

    if (apiKey.status !== 'Active') {
      await this.constantTimeDelay();
      throw new UnauthorizedException('API key is not active');
    }

    request.apiKey = apiKey;
    return true;
  }

  private async constantTimeDelay(): Promise<void> {
    await new Promise((r) => setTimeout(r, 100 + Math.random() * 100));
  }
}
