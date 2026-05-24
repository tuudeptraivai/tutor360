import { beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { viErrorMap } from '../src/common/zod/vi-error-map';

describe('viErrorMap', () => {
  beforeAll(() => {
    z.setErrorMap(viErrorMap);
  });

  it('renders too_small as a Vietnamese message', () => {
    const result = z.string().min(3).safeParse('a');
    expect(result.success).toBe(false);
    expect((result as { error: z.ZodError }).error.issues[0].message).toBe(
      'Tối thiểu 3 ký tự',
    );
  });

  it('renders invalid email as a Vietnamese message', () => {
    const result = z.string().email().safeParse('abc');
    expect(result.success).toBe(false);
    expect((result as { error: z.ZodError }).error.issues[0].message).toBe(
      'Email không hợp lệ',
    );
  });
});
