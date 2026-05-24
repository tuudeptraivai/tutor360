import 'reflect-metadata';

import { NotFoundException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { InMemoryUsersRepository } from '../src/modules/users/repositories/in-memory-users.repository';
import { UsersService } from '../src/modules/users/users.service';

function makeService(): UsersService {
  return new UsersService(new InMemoryUsersRepository());
}

const baseInput = {
  email: 'tu@x.com',
  passwordHash: 'hashed',
  role: 'student' as const,
  fullName: 'Tu Nguyen',
  country: 'VN',
};

describe('UsersService', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('create() returns a pending_verify user with uuid id, null emailVerifiedAt, lowercase email', async () => {
    const service = makeService();

    const user = await service.create({ ...baseInput, email: 'TU@X.com' });

    expect(user.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(user.status).toBe('pending_verify');
    expect(user.emailVerifiedAt).toBeNull();
    expect(user.email).toBe('tu@x.com');
    expect(user.createdAt).toBeInstanceOf(Date);
  });

  it('findByEmail() normalizes case', async () => {
    const service = makeService();

    await service.create({ ...baseInput, email: 'tu@x.com' });
    const found = await service.findByEmail('TU@X.com');

    expect(found).not.toBeNull();
    expect(found?.email).toBe('tu@x.com');
  });

  it('update() patches the user and bumps updatedAt', async () => {
    vi.useFakeTimers();
    const service = makeService();

    const user = await service.create(baseInput);
    vi.advanceTimersByTime(1_000);
    const updated = await service.update(user.id, { status: 'active' });

    expect(updated.status).toBe('active');
    expect(updated.updatedAt.getTime()).toBeGreaterThan(
      user.createdAt.getTime(),
    );
  });

  it('update() throws NotFoundException for an unknown id', async () => {
    const service = makeService();

    await expect(
      service.update('does-not-exist', { status: 'active' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
