import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

type Bucket = {
  count: number;
  resetAt: number;
};

@Injectable()
export class RateLimitService {
  private readonly buckets = new Map<string, Bucket>();

  consume(key: string, limit: number, windowMs: number) {
    const now = Date.now();
    const bucket = this.buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, {
        count: 1,
        resetAt: now + windowMs,
      });
      return;
    }

    if (bucket.count >= limit) {
      const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      throw new HttpException(
        `请求过于频繁，请在 ${retryAfterSeconds} 秒后重试`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    bucket.count += 1;
  }
}
