import { CallHandler, ExecutionContext, Injectable, NestInterceptor, StreamableFile } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ApiSuccess } from '@ledgerloop/shared-types';
import { map, type Observable } from 'rxjs';
import { RESPONSE_MESSAGE } from '../decorators/response-message.decorator';
import { Paginated } from '../http/paginated';

/** Wraps every successful JSON response in the `{ success, message, data, meta }` envelope. */
@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const message =
      this.reflector.getAllAndOverride<string>(RESPONSE_MESSAGE, [
        context.getHandler(),
        context.getClass(),
      ]) ?? 'OK';

    return next.handle().pipe(
      map((body: unknown): unknown => {
        if (body instanceof StreamableFile) return body;
        if (body instanceof Paginated) {
          return { success: true, message, data: body.items, meta: body.meta };
        }
        const envelope: ApiSuccess<unknown, null> = {
          success: true,
          message,
          data: body ?? null,
          meta: null,
        };
        return envelope;
      }),
    );
  }
}
