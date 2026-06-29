import * as crypto from 'crypto';
import * as secp256k1 from '@noble/secp256k1';
import type { ChainType, WalletProvider, SignMessageParams, SignStructuredDataParams, SignatureResult } from '../types';

secp256k1.etc.hmacSha256Sync = (k: Uint8Array, ...msgs: Uint8Array[]) => {
  let h = k;
  for (const msg of msgs) {
    const hmac = crypto.createHmac('sha256', Buffer.from(h));
    hmac.update(Buffer.from(msg));
    h = hmac.digest();
  }
  return h;
};

const BIP191_PREFIX = '\x18Stacks Signed Message:\n';

export function buildBip191Message(message: string): string {
  return BIP191_PREFIX + message.length.toString() + message;
}

export function hashMessage(message: string, chain?: ChainType): string {
  const chainType = chain || 'stacks';

  switch (chainType) {
    case 'stacks': {
      const prefixed = buildBip191Message(message);
      return crypto.createHash('sha256').update(prefixed).digest('hex');
    }
    case 'bitcoin': {
      const prefixed = '\x18Bitcoin Signed Message:\n' + message.length.toString() + message;
      const first = crypto.createHash('sha256').update(prefixed).digest();
      return crypto.createHash('sha256').update(first).digest('hex');
    }
    case 'ethereum': {
      const prefixed = '\x19Ethereum Signed Message:\n' + message.length.toString() + message;
      return '0x' + crypto.createHash('sha256').update(prefixed).digest('hex');
    }
    case 'solana': {
      return crypto.createHash('sha256').update(message).digest('hex');
    }
    case 'sui':
    case 'aptos': {
      const prefixed = '\x19Signed Message:\n' + message.length.toString() + message;
      return crypto.createHash('sha256').update(prefixed).digest('hex');
    }
    default:
      throw new Error(`Unsupported chain for message hashing: ${chainType}`);
  }
}

export async function signMessage(
  provider: WalletProvider,
  params: SignMessageParams
): Promise<SignatureResult> {
  const chain = params.chain || 'stacks';

  const signature = await provider.signMessage(params.message);

  return {
    signature,
    publicKey: '',
    address: '',
    chain,
    type: 'message',
  };
}

export function hashStructuredData(
  domain: SignStructuredDataParams['domain'],
  types: SignStructuredDataParams['types'],
  primaryType: string,
  message: Record<string, unknown>,
  chain?: ChainType
): string {
  const chainType = chain || 'stacks';

  const typeHash = hashStructType(types, primaryType);
  const dataHash = hashStructContent(types, primaryType, message);
  const domainHash = hashStructDomain(domain);

  let prefix: string;
  switch (chainType) {
    case 'stacks':
      prefix = '\x19Stacks Structured Data:\n';
      break;
    case 'ethereum':
      prefix = '\x19\x01';
      break;
    default:
      prefix = '\x19Structured Data:\n';
  }

  if (chainType === 'ethereum') {
    const combined = prefix + domainHash + typeHash + dataHash;
    return '0x' + crypto.createHash('sha256').update(Buffer.from(combined, 'hex')).digest('hex');
  }

  const combined = prefix + domainHash + typeHash + dataHash;
  return crypto.createHash('sha256').update(combined).digest('hex');
}

export function hashStructType(
  types: Record<string, Array<{ name: string; type: string }>>,
  primaryType: string
): string {
  return crypto.createHash('sha256').update(encodeType(primaryType, types)).digest('hex');
}

export function encodeType(
  primaryType: string,
  types: Record<string, Array<{ name: string; type: string }>>
): string {
  const deps = findTypeDependencies(primaryType, types);
  const sorted = [primaryType, ...deps.filter((d) => d !== primaryType).sort()];
  return sorted
    .map((type) => {
      const fields = types[type];
      if (!fields) return type + '()';
      return type + '(' + fields.map((f) => f.type + ' ' + f.name).join(',') + ')';
    })
    .join('');
}

export function findTypeDependencies(
  primaryType: string,
  types: Record<string, Array<{ name: string; type: string }>>,
  results: string[] = []
): string[] {
  if (results.includes(primaryType)) return results;
  results.push(primaryType);
  const fields = types[primaryType] || [];
  for (const field of fields) {
    const cleanType = field.type.replace(/\[\d*\]$/g, '');
    if (types[cleanType] && !results.includes(cleanType)) {
      findTypeDependencies(cleanType, types, results);
    }
  }
  return results;
}

function hashStructDomain(domain: SignStructuredDataParams['domain']): string {
  const fields = [
    { type: 'string', name: 'name' },
    { type: 'string', name: 'version' },
    { type: 'uint256', name: 'chainId' },
    { type: 'address', name: 'verifyingContract' },
    { type: 'bytes32', name: 'salt' },
  ];

  let domainEncoded = 'EIP712Domain(' + fields.map((f) => f.type + ' ' + f.name).join(',') + ')';

  for (const field of fields) {
    const value = (domain as Record<string, unknown>)[field.name];
    if (value === undefined || value === null) {
      domainEncoded += '00'.repeat(32);
    } else if (field.type === 'string') {
      const strVal = String(value);
      const hash = crypto.createHash('sha256').update(strVal).digest('hex');
      domainEncoded += hash;
    } else if (field.type === 'uint256') {
      const hex = BigInt(String(value)).toString(16).padStart(64, '0');
      domainEncoded += hex;
    } else if (field.type === 'address') {
      const addr = String(value).replace(/^0x/, '').toLowerCase().padStart(64, '0');
      domainEncoded += addr;
    } else if (field.type === 'bytes32') {
      const bytesVal = String(value).replace(/^0x/, '').padStart(64, '0');
      domainEncoded += bytesVal;
    }
  }

  return crypto.createHash('sha256').update(Buffer.from(domainEncoded, 'hex')).digest('hex');
}

function hashStructContent(
  types: Record<string, Array<{ name: string; type: string }>>,
  primaryType: string,
  data: Record<string, unknown>
): string {
  const typeHash = hashStructType(types, primaryType);

  const encodedData = encodeData(types, primaryType, data);

  const combined = typeHash + encodedData;
  return crypto.createHash('sha256').update(Buffer.from(combined, 'hex')).digest('hex');
}

function encodeData(
  types: Record<string, Array<{ name: string; type: string }>>,
  primaryType: string,
  data: Record<string, unknown>
): string {
  const fields = types[primaryType] || [];
  let encoded = '';

  for (const field of fields) {
    const value = data[field.name];
    const fieldType = field.type;

    if (value === undefined || value === null) {
      encoded += '00'.repeat(32);
    } else if (fieldType === 'string') {
      const strVal = String(value);
      const hash = crypto.createHash('sha256').update(strVal).digest('hex');
      encoded += hash;
    } else if (fieldType === 'bytes') {
      const bytesVal = String(value).replace(/^0x/, '');
      const hash = crypto.createHash('sha256').update(Buffer.from(bytesVal, 'hex')).digest('hex');
      encoded += hash;
    } else if (fieldType === 'bytes32') {
      const bytesVal = String(value).replace(/^0x/, '').padStart(64, '0');
      encoded += bytesVal;
    } else if (fieldType === 'uint256' || fieldType === 'uint128' || fieldType === 'uint64') {
      const hex = BigInt(String(value)).toString(16).padStart(64, '0');
      encoded += hex;
    } else if (fieldType === 'address') {
      const addr = String(value).replace(/^0x/, '').toLowerCase().padStart(64, '0');
      encoded += addr;
    } else if (fieldType === 'bool') {
      const boolVal = value ? '1' : '0';
      encoded += boolVal.padStart(64, '0');
    } else if (types[fieldType]) {
      const nestedHash = hashStructContent(types, fieldType, value as Record<string, unknown>);
      encoded += nestedHash;
    } else if (fieldType.endsWith('[]')) {
      const baseType = fieldType.replace(/\[\d*\]$/, '');
      const arr = Array.isArray(value) ? value : [value];
      const itemHashes = arr.map((item: unknown) => {
        if (types[baseType]) {
          return hashStructContent(types, baseType, item as Record<string, unknown>);
        }
        if (baseType === 'string') {
          return crypto.createHash('sha256').update(String(item)).digest('hex');
        }
        return BigInt(String(item)).toString(16).padStart(64, '0');
      });
      const combinedHashes = itemHashes.join('');
      encoded += crypto.createHash('sha256').update(Buffer.from(combinedHashes, 'hex')).digest('hex');
    } else {
      const hex = BigInt(String(value)).toString(16).padStart(64, '0');
      encoded += hex;
    }
  }

  return encoded;
}

export async function signStructuredData(
  provider: WalletProvider,
  params: SignStructuredDataParams
): Promise<SignatureResult> {
  const chain = params.chain || 'stacks';

  const signature = await provider.signStructuredData(params.domain, params.types, params.message);

  return {
    signature,
    publicKey: '',
    address: '',
    chain,
    type: 'structured',
  };
}

export async function signTransaction(
  provider: WalletProvider,
  tx: unknown,
  chain?: ChainType
): Promise<SignatureResult> {
  const chainType = chain || 'stacks';

  const signature = await provider.signTransaction(tx);

  return {
    signature,
    publicKey: '',
    address: '',
    chain: chainType,
    type: 'transaction',
  };
}
