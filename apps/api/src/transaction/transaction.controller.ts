import { Controller, Post, Body, UseGuards, HttpCode, HttpStatus, Req, UnauthorizedException, BadRequestException } from '@nestjs/common';
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
    private txService: TransactionService,
    private walletService: WalletService,
    private sessionVerifier: SessionVerifierService,
  ) {}

  @Post('send')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sponsor and broadcast a signed MPC transaction' })
  async send(@ApiKey() apiKey: any, @Body() dto: SendTxDto) {
    const wallet = await this.walletService.findByOrgAndAddress(
      apiKey.mpcOrg?.id,
      dto.senderAddress,
    );
    if (!wallet) throw new UnauthorizedException('Wallet not found for this API key');

    if (dto.delegation) {
      const { valid, reason } = await this.sessionVerifier.verifyDelegation(dto.delegation, dto.senderAddress);
      if (!valid) throw new BadRequestException(`Session key rejected: ${reason}`);
    }

    return this.txService.sponsor(dto.txHex, wallet.userId, dto.network ?? 'mainnet');
  }
}
