import { IsString, IsEmail, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDeveloperDto {
  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty()
  @IsString()
  @MaxLength(128)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  avatarUrl?: string;
}

export class CreateApiKeyDto {
  @ApiProperty()
  @IsString()
  @MaxLength(64)
  name: string;
}

export class ApiKeyResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  keyPrefix: string;

  @ApiProperty()
  rawKey: string;

  @ApiProperty()
  status: string;

  @ApiProperty()
  createdAt: Date;
}
