import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { ApiError } from '@ledgerloop/shared-types';
import type { Request, Response } from 'express';
import { mongo, Error as MongooseError } from 'mongoose';
import { AppException } from '../errors/app-exception';

const STATUS_CODES: Partial<Record<number, string>> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'TOO_MANY_REQUESTS',
};

/** Turns every thrown error into the `{ success: false, errorCode }` envelope. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request>();
    const [status, body] = this.toError(exception);

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} failed`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }
    response.status(status).json(body);
  }

  private toError(exception: unknown): [number, ApiError] {
    if (exception instanceof AppException) {
      return [
        exception.getStatus(),
        error(exception.message, exception.errorCode, exception.details),
      ];
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return [status, error(exception.message, STATUS_CODES[status] ?? 'HTTP_ERROR')];
    }
    if (exception instanceof mongo.MongoServerError && exception.code === 11000) {
      return [
        HttpStatus.CONFLICT,
        error('A record with these details already exists', 'DUPLICATE_RECORD', {
          fields: Object.keys(exception.keyValue ?? {}),
        }),
      ];
    }
    if (exception instanceof MongooseError.CastError) {
      return [HttpStatus.BAD_REQUEST, error(`Invalid ${exception.path}`, 'INVALID_ID')];
    }
    return [
      HttpStatus.INTERNAL_SERVER_ERROR,
      error('Something went wrong. Please try again.', 'INTERNAL_ERROR'),
    ];
  }
}

function error(message: string, errorCode: string, details: unknown = null): ApiError {
  return { success: false, message, errorCode, details };
}
