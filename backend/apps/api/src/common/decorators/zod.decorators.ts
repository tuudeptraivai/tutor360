import { Body, Param, Query } from '@nestjs/common';
import { ZodSchema } from 'zod';

import { ZodValidationPipe } from '../pipes/zod-validation.pipe';

/** `@ZodBody(schema)` = `@Body(new ZodValidationPipe(schema))`. */
export const ZodBody = (schema: ZodSchema): ParameterDecorator =>
  Body(new ZodValidationPipe(schema));

/** `@ZodQuery(schema)` = `@Query(new ZodValidationPipe(schema))`. */
export const ZodQuery = (schema: ZodSchema): ParameterDecorator =>
  Query(new ZodValidationPipe(schema));

/** `@ZodParam(key, schema)` = `@Param(key, new ZodValidationPipe(schema))`. */
export const ZodParam = (key: string, schema: ZodSchema): ParameterDecorator =>
  Param(key, new ZodValidationPipe(schema));
