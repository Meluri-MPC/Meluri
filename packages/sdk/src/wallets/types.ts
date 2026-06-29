export type ChainType = 'stacks' | 'bitcoin' | 'ethereum' | 'solana' | 'sui' | 'aptos';

export type StacksNetwork = 'mainnet' | 'testnet' | 'devnet' | 'mocknet';
export type BitcoinNetwork = 'mainnet' | 'testnet' | 'regtest' | 'signet';
export type EthereumNetwork = 'mainnet' | 'goerli' | 'sepolia' | 'holesky';
export type SolanaNetwork = 'mainnet-beta' | 'testnet' | 'devnet' | 'localnet';
export type SuiNetwork = 'mainnet' | 'testnet' | 'devnet' | 'localnet';
export type AptosNetwork = 'mainnet' | 'testnet' | 'devnet';

export type ChainNetwork =
  | { chain: 'stacks'; network: StacksNetwork }
  | { chain: 'bitcoin'; network: BitcoinNetwork }
  | { chain: 'ethereum'; network: EthereumNetwork }
  | { chain: 'solana'; network: SolanaNetwork }
  | { chain: 'sui'; network: SuiNetwork }
  | { chain: 'aptos'; network: AptosNetwork };

export interface WalletProvider {
  getAddresses(): Promise<string[]>;
  signMessage(message: string): Promise<string>;
  signTransaction(tx: unknown): Promise<string>;
  signStructuredData(domain: unknown, types: unknown, message: unknown): Promise<string>;
  getNetwork(): Promise<string>;
  switchNetwork?(network: string): Promise<void>;
  on(event: string, callback: (...args: unknown[]) => void): void;
  off(event: string, callback: (...args: unknown[]) => void): void;
  isConnected(): boolean;
  getPublicKey?(): Promise<string>;
}

export interface WalletConnector {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  readonly chains: ChainType[];
  readonly supportedNetworks: Partial<Record<ChainType, string[]>>;
  readonly installUrl: string;
  isAvailable(): boolean;
  connect(chain?: ChainType): Promise<ConnectResult>;
  disconnect(): Promise<void>;
  getProvider(): WalletProvider | null;
}

export interface ConnectResult {
  address: string;
  publicKey: string;
  chain: ChainType;
  network: string;
  provider: WalletProvider;
  connectorId: string;
}

export interface WalletEventCallbacks {
  onAccountsChanged?: (accounts: string[]) => void;
  onNetworkChanged?: (network: string) => void;
  onDisconnect?: () => void;
}

export interface WalletConnectionConfig {
  preferredWallets?: string[];
  autoConnect?: boolean;
  rememberChoice?: boolean;
  chain?: ChainType;
  network?: string;
  eventCallbacks?: WalletEventCallbacks;
}

export interface WalletDiscoveryConfig {
  chain?: ChainType;
  showInstallLinks?: boolean;
  rememberChoice?: boolean;
}

export interface SignMessageParams {
  message: string;
  chain?: ChainType;
}

export interface SignStructuredDataParams {
  domain: {
    name?: string;
    version?: string;
    chainId?: number;
    verifyingContract?: string;
    salt?: string;
  };
  types: Record<string, Array<{ name: string; type: string }>>;
  primaryType: string;
  message: Record<string, unknown>;
  chain?: ChainType;
}

export interface SignatureResult {
  signature: string;
  publicKey: string;
  address: string;
  chain: ChainType;
  type: 'message' | 'structured' | 'transaction';
}

export interface WalletPersistenceData {
  connectorId: string;
  address: string;
  chain: ChainType;
  network: string;
  connectedAt: number;
  expiresAt?: number;
}

export interface WalletMetadata {
  id: string;
  name: string;
  icon: string;
  installUrl: string;
  chains: ChainType[];
  supportedNetworks: Partial<Record<ChainType, string[]>>;
  connector?: WalletConnector;
  detected: boolean;
}
