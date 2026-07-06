import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const corsOrigins = process.env.CORS_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean) ?? [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002',
    'http://localhost:5173',
  ];

  const dynamicOrigins = [
    ...corsOrigins,
    /\.vercel\.app$/,
    /\.velumx\.xyz$/,
    /\.onrender\.com$/,
    /\.netlify\.app$/,
    /^http:\/\/localhost:\d+$/,
  ];

  app.enableCors({
    origin: dynamicOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
  });

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );

  app.setGlobalPrefix('api/v1');

  const config = new DocumentBuilder()
    .setTitle('VelumX MPC API')
    .setDescription('Stacks-native embedded wallet infrastructure — like Privy for Stacks')
    .setVersion('0.1.0')
    .addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' }, 'x-api-key')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'jwt')
    .build();

  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));

  const port = process.env.PORT || 4002;
  await app.listen(port);
  console.log(`VelumX MPC API → http://localhost:${port}`);
  console.log(`Swagger docs  → http://localhost:${port}/docs`);
}

bootstrap();
