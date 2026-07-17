import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import * as crypto from 'crypto';

const MAX_CLOCK_SKEW_MS = 30_000; // 30 seconds

/**
 * HMAC-based service-to-service authentication guard.
 * Validates X-Service-Auth header computed as HMAC-SHA256(MPC_SERVICE_SECRET, timestamp).
 *
 * If MPC_SERVICE_SECRET is not set (development mode), auth is bypassed.
 */
@Injectable()
export class ServiceAuthGuard implements CanActivate {
  private readonly logger = new Logger(ServiceAuthGuard.name);
  private readonly secret: string | undefined;

  constructor() {
    this.secret = process.env.MPC_SERVICE_SECRET;
    if (!this.secret && process.env.NODE_ENV === 'production') {
      throw new Error('MPC_SERVICE_SECRET must be set in production');
    }
    if (!this.secret) {
      this.logger.warn('MPC_SERVICE_SECRET not set — service auth bypassed (dev mode)');
    }
  }

  canActivate(context: ExecutionContext): boolean {
    // In dev, skip auth if secret not configured
    if (!this.secret) return true;

    const request = context.switchToHttp().getRequest();
    const timestamp = request.headers['x-service-timestamp'] as string | undefined;
    const providedHmac = request.headers['x-service-auth'] as string | undefined;

    if (!timestamp || !providedHmac) {
      throw new UnauthorizedException('Missing service authentication headers');
    }

    // Reject stale requests
    const diff = Math.abs(Date.now() - Number(timestamp));
    if (isNaN(diff) || diff > MAX_CLOCK_SKEW_MS) {
      throw new UnauthorizedException('Request timestamp expired or invalid');
    }

    // Constant-time comparison to prevent timing attacks
    const expectedHmac = crypto
      .createHmac('sha256', this.secret)
      .update(timestamp)
      .digest('hex');

    const expected = Buffer.from(expectedHmac, 'hex');
    const provided = Buffer.from(providedHmac, 'hex');

    if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
      this.logger.warn(`Service auth failed from ${request.ip}`);
      throw new UnauthorizedException('Invalid service authentication');
    }

    return true;
  }
}
