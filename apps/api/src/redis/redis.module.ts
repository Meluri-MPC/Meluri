import { Module, Global, Logger, Inject, Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

@Global()
@Module({})
export class RedisModule {
  static readonly logger = new Logger('RedisModule');

  static forRoot(): { module: typeof RedisModule; providers: any[]; exports: any[] } {
    const redisProvider = {
      provide: REDIS_CLIENT,
      useFactory: () => {
        const url = process.env.REDIS_URL;
        if (!url) {
          RedisModule.logger.warn('REDIS_URL not set — Redis features disabled');
          return null;
        }

        const client = new Redis(url, {
          maxRetriesPerRequest: null,
          retryStrategy(times) {
            if (times > 3) {
              RedisModule.logger.warn('Redis connection failed after 3 retries — Redis features disabled');
              return null;
            }
            return Math.min(times * 500, 3000);
          },
          lazyConnect: true,
          enableOfflineQueue: false,
        });

        client.on('connect', () => RedisModule.logger.log('Redis connected'));
        client.on('error', (err: any) => {
          if (err?.code === 'ECONNREFUSED' || err?.code === 'ENOTFOUND') {
            RedisModule.logger.warn(`Redis unavailable: ${err.message}`);
          } else {
            RedisModule.logger.error(`Redis error: ${err?.message || err}`);
          }
        });

        client.connect().catch(() => {
          RedisModule.logger.warn('Redis initial connection failed — Redis features disabled');
        });

        return client;
      },
    };

    return {
      module: RedisModule,
      providers: [redisProvider],
      exports: [redisProvider],
    };
  }
}
