import { HttpStatus, PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import { DomainError } from './errors.js';

export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const r = this.schema.safeParse(value);
    if (r.success) return r.data;
    throw new DomainError('VALIDATION', 'Data masukan tidak sah.', HttpStatus.UNPROCESSABLE_ENTITY,
      r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  }
}
