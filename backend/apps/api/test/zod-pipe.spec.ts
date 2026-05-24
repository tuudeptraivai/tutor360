import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { formatZodIssues } from '../src/common/pipes/format-zod-error';
import { ZodValidationPipe } from '../src/common/pipes/zod-validation.pipe';

const meta = { type: 'body' as const, metatype: undefined, data: undefined };

describe('ZodValidationPipe', () => {
  const schema = z.object({ name: z.string().min(3) });

  it('returns parsed data for a valid value', () => {
    const pipe = new ZodValidationPipe(schema);
    expect(pipe.transform({ name: 'abc' }, meta)).toEqual({ name: 'abc' });
  });

  it('throws BadRequestException with VALIDATION_ERROR and an array of details', () => {
    const pipe = new ZodValidationPipe(schema);

    try {
      pipe.transform({ name: 'a' }, meta);
      expect.fail('expected pipe to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      const response = (err as BadRequestException).getResponse() as {
        code: string;
        details: Array<{ path: string; code: string; message: string }>;
      };
      expect(response.code).toBe('VALIDATION_ERROR');
      expect(Array.isArray(response.details)).toBe(true);
      expect(response.details[0]).toMatchObject({
        path: 'name',
        code: 'too_small',
      });
      expect(typeof response.details[0].message).toBe('string');
    }
  });
});

describe('formatZodIssues', () => {
  it('maps path (nested), code and message', () => {
    const schema = z.object({
      a: z.object({ b: z.object({ c: z.string() }) }),
    });
    const result = schema.safeParse({ a: { b: { c: 1 } } });
    expect(result.success).toBe(false);

    const details = formatZodIssues((result as { error: z.ZodError }).error);
    expect(details).toHaveLength(1);
    expect(details[0]).toMatchObject({
      path: 'a.b.c',
      code: 'invalid_type',
    });
    expect(typeof details[0].message).toBe('string');
  });

  it('uses an empty string path for root-level issues', () => {
    const result = z.string().safeParse(123);
    const details = formatZodIssues((result as { error: z.ZodError }).error);
    expect(details[0].path).toBe('');
  });
});
