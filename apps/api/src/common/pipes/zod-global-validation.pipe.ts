import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';
import { ZodSchema } from 'zod';

interface ZodAwareType {
  zodSchema?: ZodSchema;
}

/**
 * Global, opt-in Zod validation pipe.
 *
 * Registered app-wide via `APP_PIPE`. It only validates when the target DTO
 * class exposes a static `zodSchema`; otherwise the value passes through
 * untouched. This keeps the scaffold phase free of DTOs while still wiring a
 * Zod-based global pipe as required.
 */
@Injectable()
export class ZodGlobalValidationPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    const schema = (metadata.metatype as ZodAwareType | undefined)?.zodSchema;
    if (!schema) {
      return value;
    }
    const result = schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException(result.error.flatten());
    }
    return result.data;
  }
}
