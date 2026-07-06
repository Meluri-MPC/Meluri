import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const grpcPort = process.env.GRPC_PORT || '50051';
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: 'velumx.mpc.v1',
      protoPath: join(__dirname, 'grpc/signing.proto'),
      url: `0.0.0.0:${grpcPort}`,
    },
  });

  app.enableCors();

  await app.startAllMicroservices();

  const port = process.env.PORT || 4003;
  const gossipPort = process.env.GOSSIP_PORT || '8081';
  const nodeId = process.env.NODE_ID || 'mpc-node-0';

  await app.listen(port);
  console.log(`[${nodeId}] VelumX MPC Service -> http://localhost:${port}`);
  console.log(`[${nodeId}] VelumX MPC gRPC   -> 0.0.0.0:${grpcPort}`);
  console.log(`[${nodeId}] VelumX MPC Transport -> ws://0.0.0.0:${gossipPort}`);
}
bootstrap();
