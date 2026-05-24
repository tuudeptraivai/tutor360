import 'reflect-metadata';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ZodBody, ZodParam, ZodQuery } from '../src/common/decorators';

describe('zod parameter decorators', () => {
  const schema = z.object({ name: z.string() });

  it('ZodBody is a factory returning a ParameterDecorator', () => {
    const decorator = ZodBody(schema);
    expect(typeof decorator).toBe('function');
  });

  it('ZodQuery is a factory returning a ParameterDecorator', () => {
    const decorator = ZodQuery(schema);
    expect(typeof decorator).toBe('function');
  });

  it('ZodParam is a factory returning a ParameterDecorator', () => {
    const decorator = ZodParam('id', z.string().uuid());
    expect(typeof decorator).toBe('function');
  });
});
