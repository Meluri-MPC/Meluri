import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { Metadata, ServerUnaryCall } from '@grpc/grpc-js';
import { MpcSigningService } from './signing.service';

@Controller()
export class SigningGrpcController {
  constructor(private readonly signingService: MpcSigningService) {}

  @GrpcMethod('SigningService', 'Sign')
  async sign(request: {
    walletId: string;
    message: Uint8Array;
    chain: string;
    publicKey: string;
    tenantId: string;
    apiKey?: string;
    idempotencyKey?: string;
  }) {
    const result = await this.signingService.sign({
      walletId: request.walletId,
      message: request.message instanceof Uint8Array
        ? request.message
        : Buffer.from(request.message),
      chain: request.chain,
      publicKey: request.publicKey,
      tenantId: request.tenantId,
      apiKey: request.apiKey,
      idempotencyKey: request.idempotencyKey,
    });

    return {
      signature: result.signature,
      r: result.r,
      s: result.s,
      recoveryId: result.recoveryId,
      ceremonyId: result.ceremonyId,
      chain: result.chain,
      timestamp: result.timestamp,
      durationMs: result.durationMs,
    };
  }

  @GrpcMethod('SigningService', 'GetCeremonyStatus')
  async getCeremonyStatus(request: {
    ceremonyId: string;
    tenantId: string;
  }) {
    const status = this.signingService.getCeremonyStatus(request.ceremonyId);
    if (!status) {
      return { ceremonyId: request.ceremonyId, status: 'not_found', selectedParties: [], startedAt: 0, lastActivity: 0, error: 'Ceremony not found' };
    }
    return {
      ceremonyId: status.ceremonyId,
      status: status.status,
      selectedParties: status.selectedParties,
      startedAt: status.startedAt,
      lastActivity: status.lastActivity,
      error: status.error || '',
    };
  }

  @GrpcMethod('SigningService', 'CancelCeremony')
  async cancelCeremony(request: {
    ceremonyId: string;
    tenantId: string;
  }) {
    return this.signingService.cancelCeremony(request.ceremonyId);
  }
}
