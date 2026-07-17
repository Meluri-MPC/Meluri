import { z } from 'zod';

const envSchema = z.object({
  PORT: z.string().default('4002'),
  NODE_ENV: z.enum(['development', 'production', 'test', 'staging']).default('development'),

  // ─── Database ──────────────────────────────────────────────────────
  DATABASE_URL: z.string().url().startsWith('postgresql://'),
  DIRECT_URL: z.string().url().startsWith('postgresql://').optional(),

  // ─── MPC Service ───────────────────────────────────────────────────
  MPC_SERVICE_URL: z.string().url().default('http://localhost:4003'),
  /** Shared secret for API → MPC service-to-service authentication */
  MPC_SERVICE_SECRET: z.string().min(32).optional(),

  // ─── KMS ───────────────────────────────────────────────────────────
  /** Must match KmsConfig['type'] values: local | aws-kms | gcp-kms */
  KMS_PROVIDER: z.enum(['local', 'aws-kms', 'gcp-kms']).default('local'),
  /** Required when KMS_PROVIDER=aws-kms */
  AWS_KMS_KEY_ARN: z.string().optional(),
  AWS_REGION: z.string().optional(),
  /** Required when KMS_PROVIDER=gcp-kms */
  GCP_PROJECT_ID: z.string().optional(),
  GCP_KMS_KEY_RING: z.string().optional(),
  GCP_KMS_KEY_NAME: z.string().optional(),
  GCP_KMS_LOCATION: z.string().optional(),
  /** Required when KMS_PROVIDER=local — 64 hex chars (32 bytes AES-256 key) */
  ENCRYPTION_KEY: z.string().length(64).optional(),

  // ─── Relayer ───────────────────────────────────────────────────────
  VELUMX_RELAYER_URL: z.string().url().default('https://api.velumx.xyz/api/v1'),
  VELUMX_RELAYER_API_KEY: z.string().min(1).optional(),
  VELUMX_NETWORK: z.enum(['mainnet', 'testnet']).default('testnet'),

  // ─── Hiro API ──────────────────────────────────────────────────────
  HIRO_API_URL: z.string().url().default('https://api.mainnet.hiro.so'),
  HIRO_API_KEY: z.string().optional(),

  // ─── Auth / OAuth ──────────────────────────────────────────────────
  OAUTH_REDIRECT_BASE: z.string().url().default('http://localhost:4002'),
  SENDGRID_API_KEY: z.string().optional(),
  SENDGRID_FROM: z.string().email().default('noreply@velumx.xyz'),

  // ─── Redis ─────────────────────────────────────────────────────────
  REDIS_URL: z.string().url().optional(),

  // ─── Rate Limiting ─────────────────────────────────────────────────
  RATE_LIMIT_TTL: z.string().default('60'),
  RATE_LIMIT_MAX: z.string().default('100'),

  // ─── CORS ──────────────────────────────────────────────────────────
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000,http://localhost:3001,http://localhost:5173'),

  // ─── Observability ─────────────────────────────────────────────────
  SENTRY_DSN: z.string().url().optional(),

  // ─── Clerk (dashboard only, optional in API) ───────────────────────
  CLERK_SECRET_KEY: z.string().min(1).optional(),
  CLERK_WEBHOOK_SECRET: z.string().min(1).optional(),
}).superRefine((data, ctx) => {
  // Enforce KMS-specific required vars
  if (data.NODE_ENV === 'production') {
    if (data.KMS_PROVIDER === 'local') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'KMS_PROVIDER=local is not allowed in production. Use aws-kms or gcp-kms.',
        path: ['KMS_PROVIDER'],
      });
    }
    if (data.KMS_PROVIDER === 'aws-kms' && !data.AWS_KMS_KEY_ARN) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'AWS_KMS_KEY_ARN is required when KMS_PROVIDER=aws-kms',
        path: ['AWS_KMS_KEY_ARN'],
      });
    }
    if (data.KMS_PROVIDER === 'gcp-kms' && (!data.GCP_PROJECT_ID || !data.GCP_KMS_KEY_RING || !data.GCP_KMS_KEY_NAME)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'GCP_PROJECT_ID, GCP_KMS_KEY_RING, and GCP_KMS_KEY_NAME are required when KMS_PROVIDER=gcp-kms',
        path: ['GCP_PROJECT_ID'],
      });
    }
    if (!data.MPC_SERVICE_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'MPC_SERVICE_SECRET is required in production',
        path: ['MPC_SERVICE_SECRET'],
      });
    }
  }
  if (data.KMS_PROVIDER === 'local' && !data.ENCRYPTION_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'ENCRYPTION_KEY (64 hex chars) is required when KMS_PROVIDER=local',
      path: ['ENCRYPTION_KEY'],
    });
  }
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, string | undefined>): EnvConfig {
  const result = envSchema.safeParse(raw);

  if (!result.success) {
    const errors = result.error.issues.map(
      (issue) => `  - ${issue.path.join('.')}: ${issue.message}`,
    );
    throw new Error(`Invalid environment configuration:\n${errors.join('\n')}`);
  }

  return result.data;
}

export function loadSecrets(): EnvConfig {
  return validateEnv(process.env as Record<string, string | undefined>);
}
