import { Body, Param, Query } from '@nestjs/common';
import { ApiBody, ApiParam, ApiQuery } from '@nestjs/swagger';
import { ZodSchema } from 'zod';

import { extractObjectFields, zodToOpenApi } from '../openapi';
import { ZodValidationPipe } from '../pipes/zod-validation.pipe';

/** `@ZodBody(schema)` = validate body + register OpenAPI body schema. */
export const ZodBody = (schema: ZodSchema): ParameterDecorator => {
  const apiBody = ApiBody({ schema: zodToOpenApi(schema) as never });
  const bodyParam = Body(new ZodValidationPipe(schema));
  return (
    target: object,
    propertyKey: string | symbol | undefined,
    parameterIndex: number,
  ): void => {
    bodyParam(target, propertyKey, parameterIndex);
    if (propertyKey !== undefined) {
      apiBody(
        target,
        propertyKey,
        Object.getOwnPropertyDescriptor(target, propertyKey)!,
      );
    }
  };
};

/** `@ZodQuery(schema)` = validate query + register one @ApiQuery per top-level field. */
export const ZodQuery = (schema: ZodSchema): ParameterDecorator => {
  const queryParam = Query(new ZodValidationPipe(schema));
  const fields = extractObjectFields(schema);
  return (
    target: object,
    propertyKey: string | symbol | undefined,
    parameterIndex: number,
  ): void => {
    queryParam(target, propertyKey, parameterIndex);
    if (propertyKey !== undefined) {
      const desc = Object.getOwnPropertyDescriptor(target, propertyKey)!;
      for (const f of fields) {
        ApiQuery({
          name: f.name,
          required: f.required,
          schema: f.schema as never,
        })(target, propertyKey, desc);
      }
    }
  };
};

/** `@ZodParam(key, schema)` = validate route param + register @ApiParam. */
export const ZodParam = (key: string, schema: ZodSchema): ParameterDecorator => {
  const paramDecorator = Param(key, new ZodValidationPipe(schema));
  const apiParam = ApiParam({
    name: key,
    required: true,
    schema: zodToOpenApi(schema) as never,
  });
  return (
    target: object,
    propertyKey: string | symbol | undefined,
    parameterIndex: number,
  ): void => {
    paramDecorator(target, propertyKey, parameterIndex);
    if (propertyKey !== undefined) {
      apiParam(
        target,
        propertyKey,
        Object.getOwnPropertyDescriptor(target, propertyKey)!,
      );
    }
  };
};
