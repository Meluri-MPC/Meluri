import {
  Controller, Post, Get, Patch, Delete, Body, Param,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiSecurity } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import {
  RegisterDeveloperDto,
  CreateApiKeyDto,
  ProvisionMpcDto,
  UpdateSponsorshipDto,
} from './dto/auth.dto';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { ApiKey } from '../common/decorators/api-key.decorator';

@ApiTags('Auth & API Keys')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ─── Developer registration ────────────────────────────────────────────

  @Post('register')
  @ApiOperation({ summary: 'Register a developer account' })
  register(@Body() dto: RegisterDeveloperDto) {
    return this.authService.registerDeveloper(dto);
  }

  // ─── API key management ────────────────────────────────────────────────

  @Post('api-keys')
  @UseGuards(ApiKeyGuard)
  @ApiSecurity('x-api-key')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new API key (requires an existing active key)' })
  createApiKey(@ApiKey() apiKey: any, @Body() dto: CreateApiKeyDto) {
    return this.authService.createApiKey(apiKey.developerId, dto);
  }

  @Get('api-keys')
  @UseGuards(ApiKeyGuard)
  @ApiSecurity('x-api-key')
  @ApiOperation({ summary: 'List all API keys for this developer' })
  listApiKeys(@ApiKey() apiKey: any) {
    return this.authService.listApiKeys(apiKey.developerId);
  }

  @Delete('api-keys/:id')
  @UseGuards(ApiKeyGuard)
  @ApiSecurity('x-api-key')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke an API key' })
  revokeApiKey(@ApiKey() apiKey: any, @Param('id') id: string) {
    return this.authService.revokeApiKey(apiKey.developerId, id);
  }

  // ─── MPC provisioning ─────────────────────────────────────────────────

  @Post('mpc/provision')
  @UseGuards(ApiKeyGuard)
  @ApiSecurity('x-api-key')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Provision MPC organisation for this API key',
    description:
      'Runs DKG, derives a Stacks address, and stores encrypted key shares. ' +
      'Set `sponsorFees: true` if you want to pay transaction fees on behalf of ' +
      'your end-users. Leave it `false` (default) if users pay their own fees.',
  })
  provisionMpc(@ApiKey() apiKey: any, @Body() dto: ProvisionMpcDto) {
    return this.authService.provisionMpcOrg(
      apiKey.id,
      dto.appName,
      dto.allowedDomains ?? [],
      dto.sponsorFees ?? false,
      dto.relayerUrl,
    );
  }

  // ─── Sponsorship settings ──────────────────────────────────────────────

  @Patch('mpc/sponsorship')
  @UseGuards(ApiKeyGuard)
  @ApiSecurity('x-api-key')
  @ApiOperation({
    summary: 'Update fee sponsorship settings',
    description:
      'Toggle whether this organisation pays transaction fees for its end-users. ' +
      'Optionally provide a custom relayer URL if you run your own relayer.',
  })
  updateSponsorship(@ApiKey() apiKey: any, @Body() dto: UpdateSponsorshipDto) {
    return this.authService.updateSponsorship(
      apiKey.id,
      dto.sponsorFees,
      dto.relayerUrl,
    );
  }

  @Get('mpc/sponsorship')
  @UseGuards(ApiKeyGuard)
  @ApiSecurity('x-api-key')
  @ApiOperation({ summary: 'Get current sponsorship configuration' })
  getSponsorship(@ApiKey() apiKey: any) {
    return this.authService.getSponsorship(apiKey.id);
  }
}
