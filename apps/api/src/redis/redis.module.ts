import { Module, Global, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

@Global()
@Module({})
export class RedisModule {
  private static redisClient: Redis | null = null;
  static readonly logger = new Logger('RedisModule');

  static forRoot(): { module: typeof RedisModule; providers: any[]; exports: any[] } {
    const redisProvider = {
      provide: REDIS_CLIENT,
      useFactory: () => {
        const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
        const client = new Redis(url, {
          maxRetriesPerRequest: 3,
          retryStrategy(times) {
            if (times > 10) return null;
            return Math.min(times * 200, 5000);
          },
          lazyConnect: true,
        });

        client.on('connect', () => RedisModule.logger.log('Redis connected'));
        client.on('error', (err) => RedisModule.logger.warn(`Redis error: ${err.message}`));

        RedisModule.redisClient = client;
        return client;
      },
    };

    return {
      module: RedisModule,
      providers: [redisProvider],
      exports: [redisProvider],
    };
  }

  static getClient(): Redis | null {
    return RedisModule.redisClient;
  }
}
