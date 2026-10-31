import { HttpStatus, PipeTransform } from '@nestjs/common';
import type { ZodTypeAny, z } from 'zod';
import { AppException } from '../errors/app-exception';

/** Validates and transforms a request body, query or param with a shared zod schema. */
export class ZodValidationPipe<S extends ZodTypeAny> implements PipeTransform<unknown, z.infer<S>> {
  constructor(private readonly schema: S) {}

  transform(value: unknown): z.infer<S> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_FAILED',
        'Request validation failed',
        details,
      );
    }
    return result.data;
  }
}
