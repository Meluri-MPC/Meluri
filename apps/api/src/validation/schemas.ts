import { z } from 'zod';

export const stxAddressSchema = z
  .string()
  .regex(/^S[TP][A-Z0-9]{38,40}$/, 'Invalid Stacks address format');

export const publicKeySchema = z
  .string()
  .regex(/^[0-9a-fA-F]{66}$/, 'Expected 33-byte compressed public key (hex)');

export const userIdSchema = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[a-zA-Z0-9_-]+$/, 'User ID must be alphanumeric');

export const apiKeySchema = z
  .string()
  .min(16)
  .max(128);

export const txHexSchema = z
  .string()
  .regex(/^[0-9a-fA-F]+$/, 'Transaction hex must be hexadecimal');

export const networkSchema = z
  .enum(['mainnet', 'testnet'])
  .default('mainnet');

export const amountSchema = z
  .number()
  .int()
  .min(1, 'Amount must be at least 1 micro-STX')
  .max(1_000_000_000_000_000, 'Amount exceeds maximum');

export const memoSchema = z
  .string()
  .max(34, 'Memo must be 34 bytes or less')
  .optional();

export const contractIdSchema = z
  .string()
  .regex(
    /^S[TP][A-Z0-9]{38,40}\.[a-zA-Z][a-zA-Z0-9_-]{0,39}$/,
    'Invalid contract ID format (e.g. SP2...contract-name)'
  );

export const pageSchema = z
  .string()
  .transform((val) => parseInt(val, 10))
  .pipe(z.number().int().min(1).max(1000))
  .optional()
  .default('1');

export const limitSchema = z
  .string()
  .transform((val) => parseInt(val, 10))
  .pipe(z.number().int().min(1).max(100))
  .optional()
  .default('20');

export const emailSchema = z
  .string()
  .email('Invalid email address')
  .max(256);

export const createWalletSchema = z.object({
  stxAddress: stxAddressSchema,
  publicKey: publicKeySchema,
  userId: userIdSchema,
  label: z.string().max(100).optional(),
  turnkeyWalletId: z.string().optional(),
  derivationPath: z.string().optional(),
  network: networkSchema.optional(),
});

export const updateWalletSchema = z.object({
  label: z.string().max(100).optional(),
});

export const buildStxTransferSchema = z.object({
  to: stxAddressSchema,
  amount: amountSchema,
  memo: memoSchema,
  fee: z.number().int().min(0).optional(),
  nonce: z.number().int().min(0).optional(),
});

export const sendTokenSchema = z.object({
  contractId: contractIdSchema,
  recipient: stxAddressSchema,
  amount: z.string().regex(/^\d+$/, 'Amount must be a positive integer string'),
  fee: z.number().int().min(0).optional(),
});

export const sendNftSchema = z.object({
  contractId: contractIdSchema,
  tokenId: z.number().int().min(0),
  recipient: stxAddressSchema,
  fee: z.number().int().min(0).optional(),
});

export const broadcastTxSchema = z.object({
  txHex: txHexSchema,
  delegation: z.string().optional(),
  sponsored: z.boolean().default(true).optional(),
});

export const sendTxSchema = z.object({
  txHex: txHexSchema,
  senderAddress: stxAddressSchema,
  network: networkSchema.optional(),
  delegation: z.string().optional(),
});

export const createApiKeySchema = z.object({
  name: z.string().min(1).max(64),
});

export const provisionMpcSchema = z.object({
  appName: z.string().min(1).max(128),
  allowedDomains: z.array(z.string().url()).min(1),
});

export const registerDeveloperSchema = z.object({
  email: emailSchema,
  name: z.string().min(1).max(128),
  avatarUrl: z.string().url().optional(),
});

export const simpleWalletCreateSchema = z.object({
  userId: userIdSchema,
  network: networkSchema.optional(),
});

export const simpleSendTxSchema = z.object({
  userId: userIdSchema,
  recipient: stxAddressSchema,
  amount: amountSchema,
});

export const simpleSendTokenSchema = z.object({
  userId: userIdSchema,
  contractId: contractIdSchema,
  recipient: stxAddressSchema,
  amount: z.string().regex(/^\d+$/),
});

export const simpleDeleteSchema = z.object({
  userId: userIdSchema,
});
