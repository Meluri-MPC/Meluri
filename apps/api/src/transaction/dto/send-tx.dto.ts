import { IsString, IsOptional, IsIn, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SendTxDto {
  @ApiProperty()
  @IsString()
  txHex: string;

  @ApiProperty()
  @IsString()
  @Matches(/^S[TP][A-Z0-9]{38,40}$/)
  senderAddress: string;

  @ApiPropertyOptional({ enum: ['mainnet', 'testnet'] })
  @IsOptional()
  @IsIn(['mainnet', 'testnet'])
  network?: string;

  @ApiPropertyOptional({ description: 'Session key delegation JSON' })
  @IsOptional()
  @IsString()
  delegation?: string;
}
