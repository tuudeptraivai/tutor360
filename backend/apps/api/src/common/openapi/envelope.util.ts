import type { ZodSchema } from 'zod';

import { zodToOpenApi } from './zod-to-openapi.util';

/** OpenAPI 3 schema cho envelope thành công `{ ok: true, data, requestId }`. */
export function successEnvelope(
  dataSchema: ZodSchema | Record<string, unknown>,
): Record<string, unknown> {
  const data =
    'safeParse' in (dataSchema as object)
      ? zodToOpenApi(dataSchema as ZodSchema)
      : (dataSchema as Record<string, unknown>);
  return {
    type: 'object',
    required: ['ok', 'data', 'requestId'],
    properties: {
      ok: { type: 'boolean', enum: [true] },
      data,
      requestId: { type: 'string', format: 'uuid' },
    },
  };
}

/** OpenAPI 3 schema cho envelope lỗi `{ ok: false, error, requestId }`. */
export const errorEnvelope = {
  type: 'object',
  required: ['ok', 'error', 'requestId'],
  properties: {
    ok: { type: 'boolean', enum: [false] },
    error: {
      type: 'object',
      required: ['code', 'message'],
      properties: {
        code: { type: 'string', example: 'VALIDATION_ERROR' },
        message: { type: 'string' },
        details: {},
      },
    },
    requestId: { type: 'string', format: 'uuid' },
  },
} as const;
