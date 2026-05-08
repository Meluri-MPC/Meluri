import { IsString, IsOptional, IsIn, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateWalletDto {
  @ApiProperty({ description: 'Stacks address (SP... or ST...)' })
  @IsString()
  @Matches(/^S[TP][A-Z0-9]{38,40}$/)
  stxAddress: string;

  @ApiProperty({ description: 'SECP256K1 public key hex' })
  @IsString()
  publicKey: string;

  @ApiProperty({ description: 'End-user ID from developer auth system' })
  @IsString()
  userId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  turnkeyWalletId?: string;

  @ApiPropertyOptional({ enum: ['mainnet', 'testnet'] })
  @IsOptional()
  @IsIn(['mainnet', 'testnet'])
  network?: string;
}
