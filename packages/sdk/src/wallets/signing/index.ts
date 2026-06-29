export {
  signMessage,
  signStructuredData,
  signTransaction,
  hashMessage,
  hashStructuredData,
  buildBip191Message,
  hashStructType,
  encodeType,
  findTypeDependencies,
} from './message';
export {
  verifyMessageSignature,
  verifyStructuredSignature,
  verifyTransactionSignature,
} from './verify';
export type { VerificationResult } from './verify';
