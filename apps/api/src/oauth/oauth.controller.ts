import {
  Controller, Get, Post, Body, Query, Param, Res,
  HttpCode, HttpStatus, UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';
import { OAuthService } from './oauth.service';
import { MagicLinkRequestDto, MagicLinkVerifyDto } from './dto/oauth.dto';

@ApiTags('OAuth')
@Controller('oauth')
export class OAuthController {
  constructor(private oauthService: OAuthService) {}

  @Get('providers')
  @ApiOperation({ summary: 'List available OAuth providers' })
  listProviders() {
    return { providers: this.oauthService.getProviders() };
  }

  @Get(':provider')
  @ApiOperation({ summary: 'Initiate OAuth login with a provider' })
  async initiateOAuth(
    @Param('provider') provider: string,
    @Res() res: Response,
  ) {
    const state = await this.oauthService.createState(provider);
    const authUrl = this.oauthService.getAuthUrl(provider, state);
    res.redirect(authUrl);
  }

  @Get('callback/:provider')
  @ApiOperation({ summary: 'OAuth callback handler' })
  async handleCallback(
    @Param('provider') provider: string,
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    try {
      const valid = await this.oauthService.validateState(state, provider);
      if (!valid) {
        return res.status(403).json({ error: 'Invalid or expired CSRF state' });
      }

      const result = await this.oauthService.handleCallback(provider, code);
      const redirectBase = process.env.OAUTH_REDIRECT_BASE ?? 'http://localhost:3000';
      const redirectUrl = `${redirectBase}?accessToken=${result.accessToken}&refreshToken=${result.refreshToken}&provider=${provider}&expiresIn=${result.expiresIn}`;
      res.redirect(redirectUrl);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  @Post('token/refresh')
  @ApiOperation({ summary: 'Refresh an access token using a refresh token' })
  async refreshToken(@Body('refreshToken') refreshToken: string) {
    if (!refreshToken) throw new UnauthorizedException('refreshToken required');

    const tokens = await this.oauthService.refreshSession(refreshToken);
    if (!tokens) throw new UnauthorizedException('Invalid or revoked refresh token');

    return tokens;
  }

  @Post('session/validate')
  @ApiOperation({ summary: 'Validate an access token' })
  async validateSession(@Body('accessToken') accessToken: string) {
    if (!accessToken) throw new UnauthorizedException('accessToken required');

    const session = await this.oauthService.validateAccessToken(accessToken);
    if (!session) throw new UnauthorizedException('Invalid or expired access token');

    return { valid: true, session };
  }

  @Post('session/revoke')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke a session' })
  async revokeSession(
    @Body('accessToken') accessToken?: string,
    @Body('refreshToken') refreshToken?: string,
  ) {
    await this.oauthService.revokeSession(accessToken ?? '', refreshToken);
  }

  @Post('magic-link/send')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send a magic link verification code to email' })
  async sendMagicLink(@Body() dto: MagicLinkRequestDto) {
    await this.oauthService.sendMagicLink(dto.email);
    return { success: true, message: 'Verification code sent' };
  }

  @Post('magic-link/verify')
  @ApiOperation({ summary: 'Verify magic link code and create session' })
  async verifyMagicLink(@Body() dto: MagicLinkVerifyDto) {
    try {
      const result = await this.oauthService.verifyMagicLink(dto.email, dto.code);
      return {
        userId: result.profile.providerUserId,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresIn: result.expiresIn,
        provider: 'email',
        email: result.profile.email,
        name: result.profile.name,
        avatarUrl: undefined,
      };
    } catch (error: any) {
      throw new UnauthorizedException(error.message);
    }
  }
}
