import {
  Controller, Post, Body, UseGuards, HttpCode, HttpStatus,
  UnauthorizedException, BadRequestException, NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiSecurity } from '@nestjs/swagger';
import { TransactionService } from './transaction.service';
import { SendTxDto } from './dto/send-tx.dto';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { ApiKey } from '../common/decorators/api-key.decorator';
import { WalletService } from '../wallet/wallet.service';
import { SessionVerifierService } from '../session/session-verifier.service';

@ApiTags('Transactions')
@ApiSecurity('x-api-key')
@Controller('tx')
@UseGuards(ApiKeyGuard)
export class TransactionController {
  constructor(
    private readonly txService: TransactionService,
    private readonly walletService: WalletService,
    private readonly sessionVerifier: SessionVerifierService,
  ) {}

  @Post('send')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Broadcast a signed MPC transaction',
    description:
      'If the organisation has fee sponsorship enabled (`sponsorFees=true`), ' +
      'the transaction is routed through the VelumX relayer and the developer ' +
      'pays the fee. Otherwise the transaction is broadcast directly to Hiro ' +
      'and the end-user pays their own fee.',
  })
  async send(@ApiKey() apiKey: any, @Body() dto: SendTxDto) {
    const org = apiKey.mpcOrg;
    if (!org) throw new NotFoundException('MPC not provisioned. Call POST /auth/mpc/provision first.');

    const wallet = await this.walletService.findByOrgAndAddress(org.id, dto.senderAddress);
    if (!wallet) throw new UnauthorizedException('Wallet not found for this API key');

    // Verify session key delegation if provided
    if (dto.delegation) {
      const { valid, reason } = await this.sessionVerifier.verifyDelegation(
        dto.delegation,
        dto.senderAddress,
      );
      if (!valid) throw new BadRequestException(`Session key rejected: ${reason}`);
    }

    const network = (dto.network ?? wallet.network ?? 'testnet') as 'mainnet' | 'testnet';

    return this.txService.send(
      dto.txHex,
      network,
      org.sponsorFees ?? false,
      org.relayerUrl ?? null,
    );
  }
}
