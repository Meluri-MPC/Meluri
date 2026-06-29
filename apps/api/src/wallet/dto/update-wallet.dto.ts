import { IsString, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateWalletDto {
  @ApiPropertyOptional({ description: 'New wallet label' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string;
}
