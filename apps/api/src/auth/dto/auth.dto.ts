import { IsString, IsEmail, IsOptional, IsBoolean, IsUrl, IsArray, MaxLength } from 'class-validator';
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

export class ProvisionMpcDto {
  @ApiProperty({ example: 'My App' })
  @IsString()
  @MaxLength(128)
  appName: string;

  @ApiPropertyOptional({ example: ['app.example.com'], type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedDomains?: string[];

  @ApiPropertyOptional({
    description:
      'Set to true to sponsor transaction fees for your end-users. ' +
      'When enabled, transactions are routed through the VelumX relayer and ' +
      'the developer\'s balance is charged. Default: false (users pay their own fees).',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  sponsorFees?: boolean;

  @ApiPropertyOptional({
    description: 'Optional custom relayer URL. Leave empty to use the VelumX platform relayer.',
  })
  @IsOptional()
  @IsUrl()
  relayerUrl?: string;
}

export class UpdateSponsorshipDto {
  @ApiProperty({
    description: 'Enable or disable fee sponsorship for end-users.',
  })
  @IsBoolean()
  sponsorFees: boolean;

  @ApiPropertyOptional({
    description: 'Custom relayer URL override. Set to null to use the VelumX platform relayer.',
  })
  @IsOptional()
  @IsUrl()
  relayerUrl?: string;
}

export class ApiKeyResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() keyPrefix: string;
  @ApiProperty() rawKey: string;
  @ApiProperty() status: string;
  @ApiProperty() createdAt: Date;
}
