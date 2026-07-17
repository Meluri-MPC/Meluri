import { Controller, Post, Body, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { MpcDkgService } from './dkg.service';
import { ServiceAuthGuard } from '../guards/service-auth.guard';

@Controller('dkg')
@UseGuards(ServiceAuthGuard)
export class MpcDkgController {
  constructor(private dkgService: MpcDkgService) {}

  @Post('init')
  @HttpCode(HttpStatus.OK)
  async initiateDkg(
    @Body('walletId') walletId: string,
    @Body('tenantId') tenantId: string,
  ) {
    const result = await this.dkgService.runDkg(walletId, tenantId);
    return result;
  }
}
