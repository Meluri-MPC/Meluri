import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

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
  private readonly serviceSecret: string;

  constructor(private readonly config: ConfigService) {
    this.mpcBaseUrl = this.config.get<string>('MPC_SERVICE_URL', 'http://localhost:4003');
    this.serviceSecret = this.config.get<string>('MPC_SERVICE_SECRET', '');
  }

  /**
   * Initiate DKG on the MPC service for a new wallet.
   */
  async initiateDkg(walletId: string, tenantId: string): Promise<MpcDkgResult> {
    const response = await fetch(`${this.mpcBaseUrl}/dkg/init`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.authHeaders(),
      },
      body: JSON.stringify({ walletId, tenantId }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`MPC DKG failed: ${response.status} ${errorText}`);
    }

    return response.json();
  }

  /**
   * Request an MPC signing ceremony on the MPC service.
   * Returns the DER-encoded compact signature.
   */
  async signMessage(
    walletId: string,
    message: Uint8Array,
    publicKey: string,
    chain: string,
    tenantId: string,
    idempotencyKey?: string,
  ): Promise<MpcSignResult> {
    const hexMsg = Buffer.from(message).toString('hex');

    // Deterministic idempotency key so retries are safe
    const ikey =
      idempotencyKey ??
      crypto
        .createHash('sha256')
        .update(`${walletId}:${hexMsg}`)
        .digest('hex')
        .slice(0, 32);

    const response = await fetch(`${this.mpcBaseUrl}/signing/sign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': ikey,
        ...this.authHeaders(),
      },
      body: JSON.stringify({
        walletId,
        message: hexMsg,
        publicKey,
        chain,
        tenantId,
        idempotencyKey: ikey,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`MPC signing failed: ${response.status} ${errorText}`);
    }

    return response.json();
  }

  /**
   * Shared HMAC-based service-to-service auth headers.
   * The MPC service should verify this on its side.
   */
  private authHeaders(): Record<string, string> {
    if (!this.serviceSecret) return {};
    const timestamp = String(Date.now());
    const hmac = crypto
      .createHmac('sha256', this.serviceSecret)
      .update(timestamp)
      .digest('hex');
    return {
      'X-Service-Timestamp': timestamp,
      'X-Service-Auth': hmac,
    };
  }
}
