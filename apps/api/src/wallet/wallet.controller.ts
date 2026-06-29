import {
  Controller, Post, Get, Patch, Delete, Param, Body, Query,
  UseGuards, HttpCode, HttpStatus, NotFoundException, ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiSecurity, ApiParam, ApiQuery } from '@nestjs/swagger';
import { WalletService } from './wallet.service';
import { CreateWalletDto } from './dto/create-wallet.dto';
import { UpdateWalletDto } from './dto/update-wallet.dto';
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
  @ApiOperation({ summary: 'Create a new MPC wallet for an end-user' })
  async create(@ApiKey() apiKey: any, @Body() dto: CreateWalletDto) {
    if (!apiKey.mpcOrg) throw new NotFoundException('MPC not provisioned. Call POST /auth/mpc/provision first.');

    const existing = await this.walletService.findByOrgAndAddress(apiKey.mpcOrg.id, dto.stxAddress);
    if (existing) throw new ConflictException('Wallet with this address already exists');

    return this.walletService.create(apiKey.mpcOrg.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all wallets for the organization' })
  @ApiQuery({ name: 'userId', required: false, description: 'Filter by end-user ID' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (1-based)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page (max 100)' })
  async list(
    @ApiKey() apiKey: any,
    @Query('userId') userId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    if (!apiKey.mpcOrg) throw new NotFoundException('MPC not provisioned');
    const p = Math.max(1, parseInt(page || '1', 10));
    const l = Math.min(100, Math.max(1, parseInt(limit || '20', 10)));
    return this.walletService.listWallets(apiKey.mpcOrg.id, { userId, page: p, limit: l });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get wallet by ID with balances and recent activity' })
  @ApiParam({ name: 'id', description: 'Wallet ID' })
  async getById(@ApiKey() apiKey: any, @Param('id') id: string) {
    if (!apiKey.mpcOrg) throw new NotFoundException('MPC not provisioned');
    const wallet = await this.walletService.findById(apiKey.mpcOrg.id, id);
    if (!wallet) throw new NotFoundException('Wallet not found');
    return wallet;
  }

  @Get('address/:address')
  @ApiOperation({ summary: 'Get wallet by Stacks address' })
  @ApiParam({ name: 'address' })
  async findByAddress(@ApiKey() apiKey: any, @Param('address') address: string) {
    if (!apiKey.mpcOrg) throw new NotFoundException('MPC not provisioned');
    const wallet = await this.walletService.findByOrgAndAddress(apiKey.mpcOrg.id, address);
    if (!wallet) throw new NotFoundException('Wallet not found');
    return wallet;
  }

  @Get('user/:userId')
  @ApiOperation({ summary: 'List wallets by end-user ID' })
  async findByUserId(@ApiKey() apiKey: any, @Param('userId') userId: string) {
    if (!apiKey.mpcOrg) throw new NotFoundException('MPC not provisioned');
    return this.walletService.findByOrgAndUserId(apiKey.mpcOrg.id, userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update wallet label' })
  @ApiParam({ name: 'id', description: 'Wallet ID' })
  async update(
    @ApiKey() apiKey: any,
    @Param('id') id: string,
    @Body() dto: UpdateWalletDto,
  ) {
    if (!apiKey.mpcOrg) throw new NotFoundException('MPC not provisioned');
    const wallet = await this.walletService.findById(apiKey.mpcOrg.id, id);
    if (!wallet) throw new NotFoundException('Wallet not found');
    return this.walletService.updateLabel(id, dto.label);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete wallet (7-day cooldown before hard delete)' })
  @ApiParam({ name: 'id', description: 'Wallet ID' })
  async delete(@ApiKey() apiKey: any, @Param('id') id: string) {
    if (!apiKey.mpcOrg) throw new NotFoundException('MPC not provisioned');
    const wallet = await this.walletService.findById(apiKey.mpcOrg.id, id);
    if (!wallet) throw new NotFoundException('Wallet not found');
    if (wallet.deletedAt) throw new BadRequestException('Wallet is already deleted');
    await this.walletService.softDelete(id);
  }

  @Post(':id/export')
  @ApiOperation({ summary: 'Export encrypted share bundle for recovery' })
  @ApiParam({ name: 'id', description: 'Wallet ID' })
  async export(@ApiKey() apiKey: any, @Param('id') id: string) {
    if (!apiKey.mpcOrg) throw new NotFoundException('MPC not provisioned');
    const wallet = await this.walletService.findById(apiKey.mpcOrg.id, id);
    if (!wallet) throw new NotFoundException('Wallet not found');
    return this.walletService.exportShareBundle(apiKey.mpcOrg.id, id);
  }
}
