import { HttpException, HttpStatus } from '@nestjs/common';

/** An error with a stable machine-readable code for clients. */
export class AppException extends HttpException {
  constructor(
    status: HttpStatus,
    readonly errorCode: string,
    message: string,
    readonly details: unknown = null,
  ) {
    super(message, status);
  }
}

export const notFound = (entity: string) =>
  new AppException(
    HttpStatus.NOT_FOUND,
    `${entity.toUpperCase().replace(/\s+/g, '_')}_NOT_FOUND`,
    `${entity} not found`,
  );

export const conflict = (errorCode: string, message: string, details: unknown = null) =>
  new AppException(HttpStatus.CONFLICT, errorCode, message, details);

export const unprocessable = (errorCode: string, message: string, details: unknown = null) =>
  new AppException(HttpStatus.UNPROCESSABLE_ENTITY, errorCode, message, details);

export const forbidden = (errorCode = 'FORBIDDEN', message = 'You do not have access') =>
  new AppException(HttpStatus.FORBIDDEN, errorCode, message);

export const unauthorized = (errorCode = 'UNAUTHORIZED', message = 'Authentication required') =>
  new AppException(HttpStatus.UNAUTHORIZED, errorCode, message);
