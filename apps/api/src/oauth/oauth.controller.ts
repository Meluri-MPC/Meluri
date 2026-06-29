import {
  Controller, Get, Post, Body, Query, Param, Res,
  HttpCode, HttpStatus, Req, UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Response, Request } from 'express';
import { OAuthService } from './oauth.service';
import { MagicLinkRequestDto, MagicLinkVerifyDto, SessionResponseDto } from './dto/oauth.dto';
import * as crypto from 'crypto';

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
  initiateOAuth(
    @Param('provider') provider: string,
    @Query('redirectUrl') redirectUrl: string,
    @Res() res: Response,
  ) {
    const state = crypto.randomBytes(16).toString('hex');
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
      const result = await this.oauthService.handleCallback(provider, code);
      const redirectBase = process.env.OAUTH_REDIRECT_BASE ?? 'http://localhost:3000';
      const redirectUrl = `${redirectBase}?sessionToken=${result.sessionToken}&provider=${provider}&expiresAt=${result.expiresAt.toISOString()}`;
      res.redirect(redirectUrl);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
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
  async verifyMagicLink(@Body() dto: MagicLinkVerifyDto): Promise<SessionResponseDto> {
    try {
      const result = await this.oauthService.verifyMagicLink(dto.email, dto.code);
      return {
        userId: result.profile.providerUserId,
        sessionToken: result.sessionToken,
        expiresAt: result.expiresAt.toISOString(),
        provider: 'email',
        email: result.profile.email,
        name: result.profile.name,
        avatarUrl: undefined,
      };
    } catch (error: any) {
      throw new UnauthorizedException(error.message);
    }
  }

  @Post('session/validate')
  @ApiOperation({ summary: 'Validate a session token' })
  async validateSession(@Body('sessionToken') sessionToken: string) {
    if (!sessionToken) throw new UnauthorizedException('sessionToken required');

    const session = await this.oauthService.validateSession(sessionToken);
    if (!session) throw new UnauthorizedException('Invalid or expired session');

    return { valid: true, session };
  }

  @Post('session/revoke')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke a session token' })
  async revokeSession(@Body('sessionToken') sessionToken: string) {
    await this.oauthService.revokeSession(sessionToken);
  }
}
