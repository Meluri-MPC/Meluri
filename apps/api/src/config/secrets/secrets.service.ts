import { Injectable, Logger } from '@nestjs/common';
import { EnvConfig, loadSecrets } from './env-schema';

@Injectable()
export class SecretsService {
  private readonly config: EnvConfig;
  private readonly logger = new Logger(SecretsService.name);

  constructor() {
    try {
      this.config = loadSecrets();
      this.logger.log('Environment configuration validated successfully');
      this.logSecretsSummary();
    } catch (error: any) {
      this.logger.error(`Failed to validate environment: ${error.message}`);
      throw error;
    }
  }

  private logSecretsSummary(): void {
    this.logger.log(`Environment: ${this.config.NODE_ENV}`);
    this.logger.log(`KMS Provider: ${this.config.KMS_PROVIDER}`);
    this.logger.log(`Network: ${this.config.VELUMX_NETWORK}`);
    this.logger.log(`Rate Limit: ${this.config.RATE_LIMIT_MAX} req/${this.config.RATE_LIMIT_TTL}s`);
    this.logger.log(`CORS Origins: ${this.config.CORS_ORIGINS}`);
  }

  get<K extends keyof EnvConfig>(key: K): EnvConfig[K] {
    return this.config[key];
  }

  get isProduction(): boolean {
    return this.config.NODE_ENV === 'production';
  }

  get isStaging(): boolean {
    return this.config.NODE_ENV === 'staging';
  }

  get isDevelopment(): boolean {
    return this.config.NODE_ENV === 'development';
  }

  get databaseUrl(): string {
    return this.config.DATABASE_URL;
  }

  get turnkeyOrgId(): string {
    return this.config.TURNKEY_ORGANIZATION_ID;
  }

  get kmsConfig() {
    return {
      provider: this.config.KMS_PROVIDER,
      aws: {
        keyId: this.config.AWS_KMS_KEY_ID,
        region: this.config.AWS_REGION,
      },
      gcp: {
        keyId: this.config.GCP_KMS_KEY_ID,
        projectId: this.config.GCP_PROJECT_ID,
      },
    };
  }

  get corsConfig() {
    return {
      origins: this.config.CORS_ORIGINS.split(',').map((o) => o.trim()),
    };
  }

  get rateLimitConfig() {
    return {
      ttl: parseInt(this.config.RATE_LIMIT_TTL, 10),
      limit: parseInt(this.config.RATE_LIMIT_MAX, 10),
    };
  }
}
