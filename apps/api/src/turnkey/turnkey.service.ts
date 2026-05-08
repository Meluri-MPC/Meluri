import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TurnkeyClient } from '@turnkey/http';
import { ApiKeyStamper } from '@turnkey/api-key-stamper';

@Injectable()
export class TurnkeyService {
  private readonly logger = new Logger(TurnkeyService.name);
  private client: TurnkeyClient;
  private organizationId: string;

  constructor(private config: ConfigService) {
    const publicKey = this.config.getOrThrow<string>('TURNKEY_API_PUBLIC_KEY');
    const privateKey = this.config.getOrThrow<string>('TURNKEY_API_PRIVATE_KEY');
    this.organizationId = this.config.getOrThrow<string>('TURNKEY_ORGANIZATION_ID');

    const stamper = new ApiKeyStamper({ apiPublicKey: publicKey, apiPrivateKey: privateKey });
    this.client = new TurnkeyClient(
      { baseUrl: this.config.get<string>('TURNKEY_BASE_URL', 'https://api.turnkey.com') },
      stamper,
    );
  }

  async createSubOrganization(appName: string, userIds: string[]): Promise<{
    subOrgId: string;
    walletId: string;
    address: string;
  }> {
    const { activity } = await this.client.createSubOrganization({
      type: 'ACTIVITY_TYPE_CREATE_SUB_ORGANIZATION_V8',
      timestampMs: String(Date.now()),
      organizationId: this.organizationId,
      parameters: {
        subOrganizationName: `meluri-mpc-${appName}-${Date.now()}`,
        rootUsers: userIds.map((uid) => ({
          userName: uid,
          userEmail: `${uid}@mpc.meluri.xyz`,
          apiKeys: [],
          authenticators: [],
          oauthProviders: [],
        })),
        rootQuorumThreshold: 1,
        wallet: {
          walletName: `${appName}-default`,
          accounts: [{
            curve: 'CURVE_SECP256K1',
            pathFormat: 'PATH_FORMAT_BIP32',
            path: "m/44'/5757'/0'/0/0",
            addressFormat: 'ADDRESS_FORMAT_COMPRESSED',
          }],
        },
      },
    });

    const result = activity.result.createSubOrganizationResultV8;
    if (!result) throw new Error('Failed to create sub-organization');

    const walletId = result.wallet?.walletId;
    const address = result.wallet?.addresses?.[0];
    if (!walletId || !address) throw new Error('Wallet or address not returned');

    this.logger.log(`Sub-org ${result.subOrganizationId} created with wallet ${walletId}`);
    return { subOrgId: result.subOrganizationId, walletId, address };
  }
}
