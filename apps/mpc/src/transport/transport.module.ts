import { Module, Global, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { MessageRouter } from './index';
import { WsTransport } from './ws-transport';

export const MESSAGE_ROUTER = 'MESSAGE_ROUTER';
export const TRANSPORT = 'TRANSPORT';

@Global()
@Module({})
export class TransportModule implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TransportModule.name);
  private wsTransport: WsTransport | null = null;

  static forRoot(): { module: typeof TransportModule; providers: any[]; exports: any[] } {
    const routerProvider = {
      provide: MESSAGE_ROUTER,
      useFactory: () => new MessageRouter(30000),
    };

    const transportProvider = {
      provide: TRANSPORT,
      useFactory: (router: MessageRouter) => {
        const nodeId = process.env.NODE_ID ?? 'mpc-node-0';
        const nodeIndex = parseInt(process.env.NODE_INDEX ?? '0', 10);
        const host = process.env.TRANSPORT_HOST ?? '0.0.0.0';
        const port = parseInt(process.env.GOSSIP_PORT ?? '8081', 10);
        const peerUrisRaw = process.env.PEER_URIS ?? '';

        const peerUris = peerUrisRaw
          .split(',')
          .map((u) => u.trim())
          .filter(Boolean);

        const transport = new WsTransport(router, {
          partyId: nodeIndex + 1,
          host,
          port,
          peerUris,
          reconnect: true,
        });

        (TransportModule as any).instance = transport;
        return transport;
      },
      inject: [MESSAGE_ROUTER],
    };

    return {
      module: TransportModule,
      providers: [routerProvider, transportProvider],
      exports: [routerProvider, transportProvider],
    };
  }

  async onModuleInit() {
    const transport = (TransportModule as any).instance as WsTransport;
    if (transport) {
      this.wsTransport = transport;
      await transport.start();

      const peerUrisRaw = process.env.PEER_URIS ?? '';
      const peerUris = peerUrisRaw
        .split(',')
        .map((u) => u.trim())
        .filter(Boolean);

      for (const uri of peerUris) {
        try {
          await transport.connectToPeer(uri);
          this.logger.log(`Connected to peer: ${uri}`);
        } catch (err: any) {
          this.logger.warn(`Failed to connect to peer ${uri}: ${err.message}`);
        }
      }
    }
  }

  async onModuleDestroy() {
    if (this.wsTransport) {
      await this.wsTransport.stop();
    }
  }
}
