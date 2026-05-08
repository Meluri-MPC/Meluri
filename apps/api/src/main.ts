import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3002',
      'http://localhost:5173',
      'https://meluri.xyz',
      /\.vercel\.app$/,
      /\.meluri\.xyz$/,
      /\.onrender\.com$/,
      /^http:\/\/localhost:\d+$/,
    ],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );

  app.setGlobalPrefix('api/v1');

  const config = new DocumentBuilder()
    .setTitle('Meluri MPC API')
    .setDescription('Stacks-native embedded wallet infrastructure — like Privy for Stacks')
    .setVersion('0.1.0')
    .addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' }, 'x-api-key')
    .build();

  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));

  const port = process.env.PORT || 4002;
  await app.listen(port);
  console.log(`Meluri MPC API → http://localhost:${port}`);
  console.log(`Swagger docs  → http://localhost:${port}/docs`);
}

bootstrap();
