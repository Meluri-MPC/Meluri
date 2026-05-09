import { Controller, Post, Get, Body, Param } from '@nestjs/common';
import { SimpleWalletService } from './simple-wallet.service';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('Simple Wallet')
@Controller('wallets/simple')
export class SimpleWalletController {
  constructor(private readonly service: SimpleWalletService) {}

  @Post()
  @ApiOperation({ summary: 'Create a simple wallet for a user' })
  create(@Body() body: { userId: string; network?: 'mainnet' | 'testnet' }) {
    return this.service.createWallet(body.userId, body.network);
  }

  @Get(':userId')
  @ApiOperation({ summary: 'Get wallet by userId' })
  get(@Param('userId') userId: string) {
    return this.service.getWallet(userId);
  }

  @Post('send-tx')
  @ApiOperation({ summary: 'Send STX from simple wallet' })
  send(@Body() body: { userId: string; recipient: string; amount: number }) {
    return this.service.sendStx(body.userId, body.recipient, body.amount);
  }

  @Post('send-token')
  @ApiOperation({ summary: 'Send SIP-010 token from simple wallet' })
  sendToken(@Body() body: { userId: string; contractId: string; recipient: string; amount: string }) {
    return this.service.sendToken(body.userId, body.contractId, body.recipient, body.amount);
  }
}
