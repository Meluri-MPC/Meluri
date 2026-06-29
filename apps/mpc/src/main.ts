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
  await app.listen(port);
  console.log(`VelumX MPC Service -> http://localhost:${port}`);
  console.log(`VelumX MPC gRPC   -> 0.0.0.0:${grpcPort}`);
}
bootstrap();
