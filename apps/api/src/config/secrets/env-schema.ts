import { z } from 'zod';

const envSchema = z.object({
  PORT: z.string().default('4002'),
  DATABASE_URL: z.string().url().startsWith('postgresql://'),
  DIRECT_URL: z.string().url().startsWith('postgresql://').optional(),
  VELUMX_API_URL: z.string().url().default('https://api.velumx.xyz/api/v1'),
  TURNKEY_API_URL: z.string().url().default('https://api.turnkey.com'),
  TURNKEY_ORGANIZATION_ID: z.string().min(1),
  TURNKEY_API_PRIVATE_KEY: z.string().min(1),
  TURNKEY_API_PUBLIC_KEY: z.string().min(1),
  CLERK_SECRET_KEY: z.string().min(1).optional(),
  CLERK_WEBHOOK_SECRET: z.string().min(1).optional(),
  SENTRY_DSN: z.string().url().optional(),
  REDIS_URL: z.string().url().optional(),
  KMS_PROVIDER: z.enum(['aws', 'gcp', 'local']).default('local'),
  AWS_KMS_KEY_ID: z.string().optional(),
  AWS_REGION: z.string().optional(),
  GCP_KMS_KEY_ID: z.string().optional(),
  GCP_PROJECT_ID: z.string().optional(),
  ENCRYPTION_KEY: z.string().length(64).optional(),
  RELAYER_PRIVATE_KEY: z.string().optional(),
  RELAYER_ADDRESS: z.string().optional(),
  RATE_LIMIT_TTL: z.string().default('60'),
  RATE_LIMIT_MAX: z.string().default('100'),
  CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:3001,http://localhost:5173'),
  VELUMX_NETWORK: z.enum(['mainnet', 'testnet']).default('testnet'),
  NODE_ENV: z.enum(['development', 'production', 'test', 'staging']).default('development'),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, string | undefined>): EnvConfig {
  const result = envSchema.safeParse(raw);

  if (!result.success) {
    const errors = result.error.issues.map(
      (issue) => `  - ${issue.path.join('.')}: ${issue.message}`
    );
    throw new Error(`Invalid environment configuration:\n${errors.join('\n')}`);
  }

  return result.data;
}

export function loadSecrets(): EnvConfig {
  return validateEnv(process.env as Record<string, string | undefined>);
}
