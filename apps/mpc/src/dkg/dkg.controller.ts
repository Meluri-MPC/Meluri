import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { MpcDkgService } from './dkg.service';

@Controller('dkg')
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
