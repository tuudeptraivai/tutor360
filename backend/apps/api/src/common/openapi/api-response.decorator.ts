import { ApiResponse } from '@nestjs/swagger';
import type { ZodSchema } from 'zod';

import { errorEnvelope, successEnvelope } from './envelope.util';

/** `@ApiOkEnvelope(DataDto, 200)` — document successful response wrapped in envelope. */
export function ApiOkEnvelope(
  dataSchema: ZodSchema | Record<string, unknown>,
  status: 200 | 201 | 202 = 200,
) {
  return ApiResponse({ status, schema: successEnvelope(dataSchema) as never });
}

/** `@ApiErrorEnvelope(400, 'VALIDATION_ERROR')` — document error response. */
export function ApiErrorEnvelope(
  status: 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500,
  exampleCode?: string,
) {
  const schema = exampleCode
    ? {
        ...errorEnvelope,
        properties: {
          ...errorEnvelope.properties,
          error: {
            ...errorEnvelope.properties.error,
            properties: {
              ...errorEnvelope.properties.error.properties,
              code: { type: 'string', example: exampleCode },
            },
          },
        },
      }
    : errorEnvelope;
  return ApiResponse({ status, schema: schema as never });
}
