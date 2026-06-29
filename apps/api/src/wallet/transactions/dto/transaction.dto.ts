import { IsString, IsOptional, IsNumber, IsObject, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BuildTransactionDto {
  @ApiProperty({ description: 'Recipient address' })
  @IsString()
  to: string;

  @ApiProperty({ description: 'Amount in micro-STX (1 STX = 1,000,000)' })
  @IsNumber()
  @Min(1)
  amount: number;

  @ApiPropertyOptional({ description: 'Optional memo (max 34 bytes)' })
  @IsOptional()
  @IsString()
  memo?: string;

  @ApiPropertyOptional({ description: 'Fee in micro-STX (auto-estimated if omitted)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  fee?: number;

  @ApiPropertyOptional({ description: 'Nonce override (auto-tracked if omitted)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  nonce?: number;
}

export class SendTokenDto {
  @ApiProperty({ description: 'Contract ID (e.g. SP2...contract-name)' })
  @IsString()
  contractId: string;

  @ApiProperty({ description: 'Recipient address' })
  @IsString()
  recipient: string;

  @ApiProperty({ description: 'Token amount as raw integer string' })
  @IsString()
  amount: string;

  @ApiPropertyOptional({ description: 'Fee override' })
  @IsOptional()
  @IsNumber()
  fee?: number;
}

export class SendNftDto {
  @ApiProperty({ description: 'Contract ID (e.g. SP2...contract-name)' })
  @IsString()
  contractId: string;

  @ApiProperty({ description: 'NFT token ID' })
  @IsNumber()
  tokenId: number;

  @ApiProperty({ description: 'Recipient address' })
  @IsString()
  recipient: string;

  @ApiPropertyOptional({ description: 'Fee override' })
  @IsOptional()
  @IsNumber()
  fee?: number;
}

export class ContractCallDto {
  @ApiProperty({ description: 'Contract ID (e.g. SP2...contract-name)' })
  @IsString()
  contractId: string;

  @ApiProperty({ description: 'Function name' })
  @IsString()
  functionName: string;

  @ApiProperty({ description: 'Function arguments as serialized Clarity values' })
  @IsObject()
  functionArgs: any[];

  @ApiPropertyOptional({ description: 'Fee override' })
  @IsOptional()
  @IsNumber()
  fee?: number;
}

export interface FeeEstimate {
  low: number;
  medium: number;
  high: number;
  estimatedSeconds: number;
}

export interface BuiltTransaction {
  txHex: string;
  txId?: string;
  fee: number;
  nonce: number;
  sponsored: boolean;
}
