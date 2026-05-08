import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TurnkeyService } from '../turnkey/turnkey.service';
import { RegisterDeveloperDto, CreateApiKeyDto } from './dto/auth.dto';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private turnkey: TurnkeyService,
  ) {}

  async registerDeveloper(dto: RegisterDeveloperDto) {
    return this.prisma.developer.upsert({
      where: { email: dto.email },
      update: { name: dto.name, avatarUrl: dto.avatarUrl },
      create: { email: dto.email, name: dto.name, avatarUrl: dto.avatarUrl },
    });
  }

  async createApiKey(developerId: string, dto: CreateApiKeyDto) {
    const count = await this.prisma.apiKey.count({ where: { developerId, status: 'Active' } });
    if (count >= 5) throw new Error('Maximum 5 active API keys per developer');

    const rawKey = `ml_${crypto.randomBytes(32).toString('hex')}`;
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.slice(0, 10);

    const apiKey = await this.prisma.apiKey.create({
      data: {
        developerId,
        name: dto.name,
        keyHash,
        keyPrefix,
      },
    });

    return {
      id: apiKey.id,
      name: apiKey.name,
      keyPrefix: apiKey.keyPrefix,
      rawKey,
      status: apiKey.status,
      createdAt: apiKey.createdAt,
    };
  }

  async provisionMpcOrg(apiKeyId: string, appName: string, allowedDomains: string[]) {
    const existing = await this.prisma.mpcOrganization.findUnique({ where: { apiKeyId } });
    if (existing) return existing;

    const subOrg = await this.turnkey.createSubOrganization(appName, []);

    return this.prisma.mpcOrganization.create({
      data: {
        apiKeyId,
        turnkeyOrgId: subOrg.subOrgId,
        appName,
        allowedDomains,
      },
    });
  }

  async listApiKeys(developerId: string) {
    return this.prisma.apiKey.findMany({
      where: { developerId },
      select: { id: true, name: true, keyPrefix: true, status: true, lastUsedAt: true, createdAt: true, mpcOrg: true },
    });
  }

  async revokeApiKey(developerId: string, keyId: string) {
    return this.prisma.apiKey.updateMany({
      where: { id: keyId, developerId },
      data: { status: 'Revoked' },
    });
  }
}
