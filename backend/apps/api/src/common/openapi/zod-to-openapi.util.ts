import type { ZodSchema, ZodTypeAny } from 'zod';
import { ZodObject } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

type ZodToJsonSchemaFn = (
  schema: unknown,
  options: { target: 'openApi3'; $refStrategy: 'none' },
) => Record<string, unknown>;

/** Convert Zod schema → OpenAPI 3 schema object (inline, no $ref). */
export function zodToOpenApi(schema: ZodSchema): Record<string, unknown> {
  return (zodToJsonSchema as unknown as ZodToJsonSchemaFn)(schema, {
    target: 'openApi3',
    $refStrategy: 'none',
  });
}

/** Extract top-level fields from a ZodObject (for @ApiQuery / @ApiParam per-field). */
export function extractObjectFields(
  schema: ZodSchema,
): Array<{ name: string; required: boolean; schema: Record<string, unknown> }> {
  if (!(schema instanceof ZodObject)) return [];
  const shape = schema.shape as Record<string, ZodTypeAny>;
  return Object.entries(shape).map(([name, field]) => ({
    name,
    required: !field.isOptional(),
    schema: zodToOpenApi(field),
  }));
}
