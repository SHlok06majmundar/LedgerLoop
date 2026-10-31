import {
  CallHandler,
  ExecutionContext,
  HttpStatus,
  Injectable,
  NestInterceptor,
  SetMetadata,
  UseInterceptors,
  applyDecorators,
} from '@nestjs/common';
import { ApiHeader } from '@nestjs/swagger';
import { InjectModel } from '@nestjs/mongoose';
import type { Response } from 'express';
import { mongo, type Model } from 'mongoose';
import { catchError, from, mergeMap, of, type Observable } from 'rxjs';
import type { AuthedRequest } from '../decorators/current-user.decorator';
import type { OrgRequest } from '../decorators/organization.decorator';
import { AppException, conflict, unprocessable } from '../errors/app-exception';
import { sha256 } from '../utils/crypto';
import { IdempotencyRecord } from './idempotency.schema';

const TTL_MS = 24 * 3600_000;
const KEY_PATTERN = /^[\w-]{8,100}$/;

/**
 * Makes a financial write safe to retry: the first request with a key runs,
 * repeats with the same body replay its result, and a different body is refused.
 */
export const Idempotent = () =>
  applyDecorators(
    SetMetadata('idempotent', true),
    ApiHeader({ name: 'Idempotency-Key', required: true }),
    UseInterceptors(IdempotencyInterceptor),
  );

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    @InjectModel(IdempotencyRecord.name) private readonly records: Model<IdempotencyRecord>,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const http = context.switchToHttp();
    const request = http.getRequest<AuthedRequest & OrgRequest>();
    const response = http.getResponse<Response>();

    const key = request.header('idempotency-key');
    if (!key || !KEY_PATTERN.test(key)) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'IDEMPOTENCY_KEY_REQUIRED',
        'Send a unique Idempotency-Key header (8-100 letters, digits, - or _)',
      );
    }

    const id = sha256(
      [
        request.auth?.userId,
        request.org?.organizationId,
        request.method,
        request.route?.path,
        key,
      ].join('|'),
    );
    const requestHash = sha256(JSON.stringify({ params: request.params, body: request.body }));

    try {
      await this.records.create({
        _id: id,
        requestHash,
        state: 'IN_PROGRESS',
        expiresAt: new Date(Date.now() + TTL_MS),
      });
    } catch (err) {
      if (!(err instanceof mongo.MongoServerError && err.code === 11000)) throw err;
      const existing = await this.records.findById(id).lean().exec();
      if (!existing) throw conflict('IDEMPOTENCY_IN_PROGRESS', 'Retry this request shortly');
      if (existing.requestHash !== requestHash) {
        throw unprocessable(
          'IDEMPOTENCY_KEY_REUSED',
          'This Idempotency-Key was already used for a different request',
        );
      }
      if (existing.state === 'IN_PROGRESS') {
        throw conflict('IDEMPOTENCY_IN_PROGRESS', 'The original request is still being processed');
      }
      response.status(existing.statusCode ?? HttpStatus.OK);
      return of(existing.body);
    }

    return next.handle().pipe(
      mergeMap((body) =>
        from(
          this.records
            .updateOne(
              { _id: id },
              { state: 'COMPLETED', statusCode: response.statusCode, body: toPlain(body) },
            )
            .then(() => body),
        ),
      ),
      catchError((err: unknown) =>
        // Failed requests release the key so the client can retry.
        from(this.records.deleteOne({ _id: id }).then(() => Promise.reject(err))),
      ),
    );
  }
}

function toPlain(body: unknown): unknown {
  return body === undefined ? null : (JSON.parse(JSON.stringify(body)) as unknown);
}
