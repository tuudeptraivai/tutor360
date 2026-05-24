import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';
import { ZodSchema } from 'zod';

import { formatZodIssues } from './format-zod-error';

/**
 * Per-route Zod validation pipe.
 *
 * Usage: `@UsePipes(new ZodValidationPipe(mySchema))` or as a parameter pipe.
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown, _metadata: ArgumentMetadata): unknown {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        details: formatZodIssues(result.error),
      });
    }
    return result.data;
  }
}
