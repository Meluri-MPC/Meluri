import { Controller, Post, Get, Delete, Body, Param, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiSecurity } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDeveloperDto, CreateApiKeyDto } from './dto/auth.dto';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { ApiKey } from '../common/decorators/api-key.decorator';

@ApiTags('Auth & API Keys')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a developer account' })
  register(@Body() dto: RegisterDeveloperDto) {
    return this.authService.registerDeveloper(dto);
  }

  @Post('api-keys')
  @UseGuards(ApiKeyGuard)
  @ApiSecurity('x-api-key')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new API key (requires existing key)' })
  createApiKey(@ApiKey() apiKey: any, @Body() dto: CreateApiKeyDto) {
    return this.authService.createApiKey(apiKey.developerId, dto);
  }

  @Get('api-keys')
  @UseGuards(ApiKeyGuard)
  @ApiSecurity('x-api-key')
  @ApiOperation({ summary: 'List all API keys' })
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

  @Post('mpc/provision')
  @UseGuards(ApiKeyGuard)
  @ApiSecurity('x-api-key')
  @ApiOperation({ summary: 'Provision MPC organization for this API key' })
  provisionMpc(
    @ApiKey() apiKey: any,
    @Body() body: { appName: string; allowedDomains: string[] },
  ) {
    return this.authService.provisionMpcOrg(apiKey.id, body.appName, body.allowedDomains);
  }
}
