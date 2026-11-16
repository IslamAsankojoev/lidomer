import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { z } from 'zod';

/** Проверка входных данных zod-схемой из packages/shared: `@Body(new ZodPipe(schema))`. */
export class ZodPipe<S extends z.ZodType> implements PipeTransform<unknown, z.infer<S>> {
  constructor(private readonly schema: S) {}

  transform(value: unknown): z.infer<S> {
    const parsed = this.schema.safeParse(value);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '),
      );
    }
    return parsed.data;
  }
}
