import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MpcProvisionService } from '../mpc/mpc-provision.service';
import { RegisterDeveloperDto, CreateApiKeyDto } from './dto/auth.dto';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mpcProvision: MpcProvisionService,
  ) {}

  async registerDeveloper(dto: RegisterDeveloperDto) {
    return this.prisma.developer.upsert({
      where: { email: dto.email },
      update: { name: dto.name, avatarUrl: dto.avatarUrl },
      create: { email: dto.email, name: dto.name, avatarUrl: dto.avatarUrl },
    });
  }

  async createApiKey(developerId: string, dto: CreateApiKeyDto) {
    const count = await this.prisma.apiKey.count({
      where: { developerId, status: 'Active' },
    });
    if (count >= 5) throw new Error('Maximum 5 active API keys per developer');

    const rawKey = `ml_${crypto.randomBytes(32).toString('hex')}`;
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.slice(0, 10);

    const apiKey = await this.prisma.apiKey.create({
      data: { developerId, name: dto.name, keyHash, keyPrefix },
    });

    return {
      id: apiKey.id,
      name: apiKey.name,
      keyPrefix: apiKey.keyPrefix,
      rawKey, // Only time the raw key is returned — store it securely
      status: apiKey.status,
      createdAt: apiKey.createdAt,
    };
  }

  /**
   * Provision a native MPC organisation for a developer's API key.
   * Runs DKG, derives Stacks address, stores encrypted key shares.
   */
  async provisionMpcOrg(
    apiKeyId: string,
    appName: string,
    allowedDomains: string[],
    sponsorFees = false,
    relayerUrl?: string,
  ) {
    return this.mpcProvision.provisionMpcOrg(
      apiKeyId,
      appName,
      allowedDomains,
      sponsorFees,
      relayerUrl,
    );
  }

  /**
   * Update the sponsorship settings for an existing MPC organisation.
   */
  async updateSponsorship(
    apiKeyId: string,
    sponsorFees: boolean,
    relayerUrl?: string,
  ) {
    const org = await this.prisma.mpcOrganization.findUnique({ where: { apiKeyId } });
    if (!org) throw new Error('MPC organisation not found — provision first');

    return this.prisma.mpcOrganization.update({
      where: { apiKeyId },
      data: {
        sponsorFees,
        relayerUrl: relayerUrl ?? null,
      },
    });
  }

  async listApiKeys(developerId: string) {
    return this.prisma.apiKey.findMany({
      where: { developerId },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        status: true,
        lastUsedAt: true,
        createdAt: true,
        mpcOrg: true,
      },
    });
  }

  async revokeApiKey(developerId: string, keyId: string) {
    return this.prisma.apiKey.updateMany({
      where: { id: keyId, developerId },
      data: { status: 'Revoked' },
    });
  }

  async getSponsorship(apiKeyId: string) {
    const org = await this.prisma.mpcOrganization.findUnique({
      where: { apiKeyId },
      select: { sponsorFees: true, relayerUrl: true, appName: true },
    });
    if (!org) return { provisioned: false };
    return {
      provisioned: true,
      sponsorFees: org.sponsorFees,
      relayerUrl: org.relayerUrl,
      appName: org.appName,
    };
  }
}
