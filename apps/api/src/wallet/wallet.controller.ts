import { Controller, Post, Get, Param, Body, UseGuards, HttpCode, HttpStatus, NotFoundException, ConflictException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiSecurity, ApiParam } from '@nestjs/swagger';
import { WalletService } from './wallet.service';
import { CreateWalletDto } from './dto/create-wallet.dto';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { ApiKey } from '../common/decorators/api-key.decorator';

@ApiTags('Wallets')
@ApiSecurity('x-api-key')
@Controller('wallets')
@UseGuards(ApiKeyGuard)
export class WalletController {
  constructor(private walletService: WalletService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register an MPC wallet for an end-user' })
  async create(@ApiKey() apiKey: any, @Body() dto: CreateWalletDto) {
    const existing = await this.walletService.findByUserId(apiKey.id, dto.userId);
    if (existing) throw new ConflictException('Wallet already exists for this user');

    if (!apiKey.mpcOrg) throw new NotFoundException('MPC not provisioned. Call POST /auth/mpc/provision first.');

    return this.walletService.create(apiKey.mpcOrg.id, dto);
  }

  @Get(':address')
  @ApiOperation({ summary: 'Get wallet by Stacks address' })
  @ApiParam({ name: 'address' })
  async findByAddress(@ApiKey() apiKey: any, @Param('address') address: string) {
    if (!apiKey.mpcOrg) throw new NotFoundException('MPC not provisioned');
    const wallet = await this.walletService.findByOrgAndAddress(apiKey.mpcOrg.id, address);
    if (!wallet) throw new NotFoundException('Wallet not found');
    return wallet;
  }

  @Get('user/:userId')
  @ApiOperation({ summary: 'Get wallet by end-user ID' })
  async findByUserId(@ApiKey() apiKey: any, @Param('userId') userId: string) {
    const wallet = await this.walletService.findByUserId(apiKey.id, userId);
    if (!wallet) throw new NotFoundException('Wallet not found for this user');
    return wallet;
  }
}
