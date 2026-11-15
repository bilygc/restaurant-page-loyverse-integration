import { PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import { ValidationError } from './errors';

/**
 * Zod-based validation pipe. Used per controller parameter with an explicit
 * shared schema (contract-first; no class-validator DTO duplication).
 * On failure it throws a ValidationError whose message contains only field
 * PATHS — never the received values (which could be PII or secrets).
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;
    const fields = result.error.issues
      .map((issue) => issue.path.join('.') || '(root)')
      .filter((field, index, all) => all.indexOf(field) === index);
    const suffix = fields.length ? `: ${fields.join(', ')}` : '';
    throw new ValidationError(`Request validation failed${suffix}`);
  }
}
