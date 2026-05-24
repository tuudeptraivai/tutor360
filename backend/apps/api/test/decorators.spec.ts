import 'reflect-metadata';

import { describe, expect, it } from 'vitest';

import {
  IS_PUBLIC_KEY,
  Public,
  ROLES_KEY,
  Roles,
} from '../src/common/decorators';

describe('common decorators', () => {
  it('Public() sets isPublic metadata', () => {
    class Target {}
    Public()(Target);

    expect(IS_PUBLIC_KEY).toBe('isPublic');
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, Target)).toBe(true);
  });

  it('Roles() sets the provided roles metadata', () => {
    class Target {}
    Roles('admin', 'tutor')(Target);

    expect(ROLES_KEY).toBe('roles');
    expect(Reflect.getMetadata(ROLES_KEY, Target)).toEqual(['admin', 'tutor']);
  });
});
