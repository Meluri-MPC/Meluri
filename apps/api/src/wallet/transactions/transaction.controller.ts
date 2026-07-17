import { Controller, Post, Param, Body, UseGuards, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiSecurity, ApiParam } from '@nestjs/swagger';
import { TransactionBuilderService } from './transaction-builder.service';
import { WalletService } from '../wallet.service';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { ApiKey } from '../../common/decorators/api-key.decorator';
import {
  BuildTransactionDto,
  SendTokenDto,
  SendNftDto,
  ContractCallDto,
} from './dto/transaction.dto';

@ApiTags('Wallet Transactions')
@ApiSecurity('x-api-key')
@Controller('wallets/:id/transactions')
@UseGuards(ApiKeyGuard)
export class WalletTransactionController {
  constructor(
    private txBuilder: TransactionBuilderService,
    private walletService: WalletService,
  ) {}

  private async getWallet(apiKey: any, walletId: string) {
    if (!apiKey.mpcOrg) throw new NotFoundException('MPC not provisioned');
    const wallet = await this.walletService.findById(apiKey.mpcOrg.id, walletId);
    if (!wallet) throw new NotFoundException('Wallet not found');
    return wallet;
  }

  @Post('send-stx')
  @ApiOperation({ summary: 'Build unsigned STX transfer' })
  @ApiParam({ name: 'id', description: 'Wallet ID' })
  async sendStx(@ApiKey() apiKey: any, @Param('id') id: string, @Body() dto: BuildTransactionDto) {
    const wallet = await this.getWallet(apiKey, id);
    return this.txBuilder.buildStxTransfer(wallet, dto);
  }

  @Post('send-token')
  @ApiOperation({ summary: 'Build unsigned SIP-010 token transfer' })
  async sendToken(@ApiKey() apiKey: any, @Param('id') id: string, @Body() dto: SendTokenDto) {
    const wallet = await this.getWallet(apiKey, id);
    return this.txBuilder.buildTokenTransfer(wallet, dto);
  }

  @Post('send-nft')
  @ApiOperation({ summary: 'Build unsigned SIP-009 NFT transfer' })
  async sendNft(@ApiKey() apiKey: any, @Param('id') id: string, @Body() dto: SendNftDto) {
    const wallet = await this.getWallet(apiKey, id);
    return this.txBuilder.buildNftTransfer(wallet, dto);
  }

  @Post('contract-call')
  @ApiOperation({ summary: 'Build unsigned contract call' })
  async contractCall(@ApiKey() apiKey: any, @Param('id') id: string, @Body() dto: ContractCallDto) {
    const wallet = await this.getWallet(apiKey, id);
    return this.txBuilder.buildContractCall(wallet, dto);
  }

  @Post('broadcast')
  @ApiOperation({
    summary: 'Broadcast a signed transaction',
    description:
      'Routes via the VelumX relayer (sponsored) if the organisation has `sponsorFees` enabled. ' +
      'Otherwise broadcasts directly to Hiro — the end-user pays their own fee.',
  })
  async broadcast(
    @ApiKey() apiKey: any,
    @Param('id') id: string,
    @Body() body: { txHex: string; delegation?: string },
  ) {
    const wallet = await this.getWallet(apiKey, id);
    const org = apiKey.mpcOrg ?? { sponsorFees: false, relayerUrl: null };
    return this.txBuilder.broadcast(wallet, body, org);
  }

  @Post('estimate-fee')
  @ApiOperation({ summary: 'Estimate transaction fee' })
  async estimateFee(@ApiKey() apiKey: any, @Param('id') id: string) {
    await this.getWallet(apiKey, id);
    return this.txBuilder.estimateFee();
  }
}
