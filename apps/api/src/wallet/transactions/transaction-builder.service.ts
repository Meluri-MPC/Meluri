import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { RelayerService } from '../../relayer/relayer.service';
import { IndexingService } from '../../indexing/indexing.service';
import {
  makeUnsignedSTXTokenTransfer,
  makeUnsignedContractCall,
  PostConditionMode,
  uintCV,
  standardPrincipalCV,
  someCV,
  noneCV,
  publicKeyToAddress,
} from '@stacks/transactions';
import { STACKS_MAINNET, STACKS_TESTNET } from '@stacks/network';
import {
  BuildTransactionDto,
  SendTokenDto,
  SendNftDto,
  ContractCallDto,
  FeeEstimate,
  BuiltTransaction,
} from './dto/transaction.dto';

const DEFAULT_FEE_LOW = 1000;
const DEFAULT_FEE_MEDIUM = 5000;
const DEFAULT_FEE_HIGH = 10000;
const FEE_BUFFER_PCT = 0.10;

@Injectable()
export class TransactionBuilderService {
  private readonly logger = new Logger(TransactionBuilderService.name);
  private readonly hiroBase: string;

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
    private relayer: RelayerService,
    private indexing: IndexingService,
  ) {
    this.hiroBase = this.config.get<string>('HIRO_API_URL', 'https://api.mainnet.hiro.so');
  }

  async buildStxTransfer(
    wallet: any,
    dto: BuildTransactionDto,
  ): Promise<BuiltTransaction> {
    const network = wallet.network === 'mainnet' ? STACKS_MAINNET : STACKS_TESTNET;

    const nonce = await this.resolveNonce(wallet, dto.nonce);
    const fee = dto.fee ?? await this.estimateStxFee();

    const tx = await makeUnsignedSTXTokenTransfer({
      recipient: dto.to,
      amount: BigInt(dto.amount),
      memo: dto.memo ?? '',
      publicKey: wallet.publicKey,
      network: network as any,
      fee: BigInt(fee),
      nonce: BigInt(nonce),
    });

    return {
      txHex: Buffer.from(tx.serialize()).toString('hex'),
      fee,
      nonce,
      sponsored: false,
    };
  }

  async buildTokenTransfer(
    wallet: any,
    dto: SendTokenDto,
  ): Promise<BuiltTransaction> {
    const network = wallet.network === 'mainnet' ? STACKS_MAINNET : STACKS_TESTNET;
    const [contractAddress, contractName] = dto.contractId.split('.');

    const nonce = await this.resolveNonce(wallet);
    const fee = dto.fee ?? await this.estimateStxFee();

    const tx = await makeUnsignedContractCall({
      contractAddress,
      contractName,
      functionName: 'transfer',
      functionArgs: [
        uintCV(BigInt(dto.amount)),
        standardPrincipalCV(wallet.stxAddress),
        standardPrincipalCV(dto.recipient),
        noneCV(),
      ],
      publicKey: wallet.publicKey,
      network: network as any,
      fee: BigInt(fee),
      nonce: BigInt(nonce),
      postConditionMode: PostConditionMode.Allow,
    });

    return {
      txHex: Buffer.from(tx.serialize()).toString('hex'),
      fee,
      nonce,
      sponsored: false,
    };
  }

  async buildNftTransfer(
    wallet: any,
    dto: SendNftDto,
  ): Promise<BuiltTransaction> {
    const network = wallet.network === 'mainnet' ? STACKS_MAINNET : STACKS_TESTNET;
    const [contractAddress, contractName] = dto.contractId.split('.');

    const nonce = await this.resolveNonce(wallet);
    const fee = dto.fee ?? await this.estimateStxFee();

    const tx = await makeUnsignedContractCall({
      contractAddress,
      contractName,
      functionName: 'transfer',
      functionArgs: [
        uintCV(BigInt(dto.tokenId)),
        standardPrincipalCV(wallet.stxAddress),
        standardPrincipalCV(dto.recipient),
      ],
      publicKey: wallet.publicKey,
      network: network as any,
      fee: BigInt(fee),
      nonce: BigInt(nonce),
      postConditionMode: PostConditionMode.Allow,
    });

    return {
      txHex: Buffer.from(tx.serialize()).toString('hex'),
      fee,
      nonce,
      sponsored: false,
    };
  }

  async buildContractCall(
    wallet: any,
    dto: ContractCallDto,
  ): Promise<BuiltTransaction> {
    const network = wallet.network === 'mainnet' ? STACKS_MAINNET : STACKS_TESTNET;
    const [contractAddress, contractName] = dto.contractId.split('.');

    const nonce = await this.resolveNonce(wallet);
    const fee = dto.fee ?? await this.estimateStxFee();

    const tx = await makeUnsignedContractCall({
      contractAddress,
      contractName,
      functionName: dto.functionName,
      functionArgs: dto.functionArgs,
      publicKey: wallet.publicKey,
      network: network as any,
      fee: BigInt(fee),
      nonce: BigInt(nonce),
      postConditionMode: PostConditionMode.Allow,
    });

    return {
      txHex: Buffer.from(tx.serialize()).toString('hex'),
      fee,
      nonce,
      sponsored: false,
    };
  }

  async broadcast(
    wallet: any,
    dto: { txHex: string; delegation?: string },
    org: { sponsorFees: boolean; relayerUrl?: string | null },
  ): Promise<{ txid: string; status: string; sponsored: boolean }> {
    return this.relayer.broadcast(dto.txHex, {
      network: wallet.network as 'mainnet' | 'testnet',
      sponsorFees: org.sponsorFees,
      relayerUrl: org.relayerUrl,
    });
  }

  async estimateStxFee(): Promise<number> {
    try {
      const res = await fetch(`${this.hiroBase}/v2/fees/transfer`);
      if (res.ok) {
        const raw = await res.text();
        return parseInt(raw, 10) || DEFAULT_FEE_MEDIUM;
      }
    } catch {}
    return DEFAULT_FEE_MEDIUM;
  }

  async estimateFee(): Promise<FeeEstimate> {
    let fee = DEFAULT_FEE_MEDIUM;
    try {
      fee = await this.estimateStxFee();
    } catch {}

    const buffer = Math.ceil(fee * FEE_BUFFER_PCT);
    return {
      low: Math.max(1, fee - buffer),
      medium: fee,
      high: fee + buffer,
      estimatedSeconds: 600,
    };
  }

  private async resolveNonce(wallet: any, override?: number): Promise<number> {
    if (override !== undefined && override !== null) return override;

    const pendingCount = await this.prisma.mpcTransaction.count({
      where: { walletId: wallet.id, status: 'pending' },
    });

    return wallet.nonce + pendingCount;
  }
}
