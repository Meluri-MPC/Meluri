export interface MeluriMPCConfig {
  apiKey: string;
  network?: 'mainnet' | 'testnet';
  backendUrl?: string;
  clerkPublishableKey?: string;
}

export interface MPCWallet {
  id: string;
  userId: string;
  stxAddress: string;
  publicKey: string;
  network: string;
  createdAt: string;
  turnkeyWalletId?: string;
}

export interface AssetBalances {
  stx: StxBalance | null;
  tokens: TokenBalance[];
  nfts: NftBalance[];
}

export interface StxBalance { assetType: 'STX'; symbol: string; name: string; decimals: number; balance: string; }
export interface TokenBalance { assetType: 'FT'; contractAddress: string; symbol: string; name: string; decimals: number; balance: string; }
export interface NftBalance { assetType: 'NFT'; contractAddress: string; symbol: string; name: string; tokenId: string; metadataUri?: string; }

export interface SendSTXParams { recipient: string; amount: number; memo?: string; }
export interface SendTokenParams { contractAddress: string; recipient: string; amount: string; }
export interface SendNFTParams { contractAddress: string; tokenId: number | string; recipient: string; }
export interface TransactionRecord { id: string; txid: string; type: string; fromAddress: string; toAddress?: string; amount?: string; status: string; blockHeight?: number; network: string; createdAt: string; }

export interface SessionDelegation {
  sessionPublicKey: string;
  walletPublicKey: string;
  walletAddress: string;
  expiresAt: number;
  nonce: string;
  signature: { r: string; s: string; v: string };
}

export interface SessionKey {
  privateKey: string;
  publicKey: string;
  delegation: SessionDelegation;
}
