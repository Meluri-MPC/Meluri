import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { MpcSigningService } from './grpc/signing.service';

@Controller('signing')
export class SigningController {
  constructor(private readonly signingService: MpcSigningService) {}

  @Post('sign')
  async sign(@Body() body: {
    walletId: string;
    message: string;
    chain: string;
    publicKey?: string;
    tenantId?: string;
    apiKey?: string;
    idempotencyKey?: string;
  }) {
    const messageBytes = Buffer.from(body.message, 'hex');
    return this.signingService.sign({
      walletId: body.walletId,
      message: messageBytes,
      chain: body.chain,
      publicKey: body.publicKey || '',
      tenantId: body.tenantId || 'default',
      apiKey: body.apiKey,
      idempotencyKey: body.idempotencyKey,
    });
  }

  @Get('ceremony/:ceremonyId')
  getCeremonyStatus(@Param('ceremonyId') ceremonyId: string) {
    const status = this.signingService.getCeremonyStatus(ceremonyId);
    if (!status) {
      return { ceremonyId, status: 'not_found', error: 'Ceremony not found' };
    }
    return status;
  }

  @Post('ceremony/:ceremonyId/cancel')
  cancelCeremony(@Param('ceremonyId') ceremonyId: string) {
    return this.signingService.cancelCeremony(ceremonyId);
  }

  @Get('stats')
  getStats() {
    return this.signingService.getStats();
  }

  @Get('audit')
  getAuditLogs(
    @Query('walletId') walletId?: string,
    @Query('developerId') developerId?: string,
  ) {
    return this.signingService.getAuditLogs(walletId, developerId);
  }

  @Get('health')
  health() {
    return {
      status: 'ok',
      service: 'velumx-mpc-signing',
      timestamp: Date.now(),
    };
  }
}
