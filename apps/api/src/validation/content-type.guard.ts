import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import * as contentTypeNegotiator from 'content-type';
import type { Request } from 'express';

@Injectable()
export class ContentTypeGuard implements CanActivate {
  private readonly allowedContentTypes = [
    'application/json',
    'application/json; charset=utf-8',
  ];

  private readonly maxBodySize = 1 * 1024 * 1024; // 1 MB

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    if (request.method === 'GET' || request.method === 'HEAD') {
      return true;
    }

    const contentType = request.headers['content-type'];
    if (!contentType) {
      throw new HttpException(
        'Content-Type header is required',
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
      );
    }

    const parsed = contentTypeNegotiator.parse(contentType);
    if (!this.allowedContentTypes.some((t) => t.startsWith(parsed.type))) {
      throw new HttpException(
        `Unsupported Content-Type: ${parsed.type}. Use application/json`,
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
      );
    }

    const contentLength = parseInt(
      request.headers['content-length'] || '0',
      10,
    );
    if (contentLength > this.maxBodySize) {
      throw new HttpException(
        `Payload too large. Maximum: ${this.maxBodySize} bytes`,
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
    }

    return true;
  }
}
