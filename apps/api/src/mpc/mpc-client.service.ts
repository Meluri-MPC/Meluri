import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface MpcDkgResult {
  walletId: string;
  publicKey: string;
  shares: Array<{ partyId: number; share: string }>;
}

export interface MpcSignResult {
  signature: string;
  r: string;
  s: string;
  recoveryId: number;
  ceremonyId: string;
  chain: string;
  timestamp: number;
  durationMs: number;
}

@Injectable()
export class MpcClientService {
  private readonly logger = new Logger(MpcClientService.name);
  private readonly mpcBaseUrl: string;

  constructor(private config: ConfigService) {
    this.mpcBaseUrl = this.config.get<string>('MPC_SERVICE_URL', 'http://localhost:4003');
  }

  async initiateDkg(walletId: string, tenantId: string): Promise<MpcDkgResult> {
    const response = await fetch(`${this.mpcBaseUrl}/dkg/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletId, tenantId }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`MPC DKG failed: ${response.status} ${errorText}`);
    }

    return response.json();
  }

  async signMessage(
    walletId: string,
    message: Uint8Array,
    publicKey: string,
    chain: string,
    tenantId: string,
    apiKey: string,
  ): Promise<MpcSignResult> {
    const hexMsg = Buffer.from(message).toString('hex');
    const idempotencyKey = `${walletId}:${hexMsg.slice(0, 16)}:${Date.now()}`;

    const response = await fetch(`${this.mpcBaseUrl}/api/v1/signing/sign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        walletId,
        message: hexMsg,
        publicKey,
        chain,
        tenantId,
        apiKey,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`MPC signing failed: ${response.status} ${errorText}`);
    }

    return response.json();
  }
}
