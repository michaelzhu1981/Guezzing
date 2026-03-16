import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly redis = new Redis({
    host: process.env.REDIS_HOST || 'redis',
    port: Number(process.env.REDIS_PORT || 6379),
    lazyConnect: false,
    maxRetriesPerRequest: null,
  });

  get client() {
    return this.redis;
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }
}
