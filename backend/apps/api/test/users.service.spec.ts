import 'reflect-metadata';

import { NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Env } from '../src/config/env.validation';
import { InMemoryUsersRepository } from '../src/modules/users/repositories/in-memory-users.repository';
import { UsersService } from '../src/modules/users/users.service';

const fakeConfig = {
  get: (key: string) => ({ BCRYPT_COST: 4 })[key],
} as unknown as ConfigService<Env, true>;

function makeService(): UsersService {
  return new UsersService(new InMemoryUsersRepository(), fakeConfig);
}

const baseInput = {
  email: 'tu@x.com',
  passwordHash: 'hashed',
  role: 'user' as const,
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

describe('UsersService admin CRUD', () => {
  async function seed(service: UsersService) {
    const admin = await service.adminCreate({
      email: 'admin@x.com',
      password: 'Strong1234',
      fullName: 'Admin One',
      role: 'admin',
      country: 'VN',
    });
    const tutor = await service.adminCreate({
      email: 'tutor@x.com',
      password: 'Strong1234',
      fullName: 'Tutor One',
      role: 'tutor',
      country: 'VN',
    });
    const user = await service.adminCreate({
      email: 'user@x.com',
      password: 'Strong1234',
      fullName: 'Plain User',
      role: 'user',
      country: 'VN',
    });
    return { admin, tutor, user };
  }

  it('adminCreate() hashes the password, defaults to active + sets emailVerifiedAt', async () => {
    const service = makeService();

    const user = await service.adminCreate({
      email: 'NEW@x.com',
      password: 'Strong1234',
      fullName: 'New User',
      role: 'hanah',
      country: 'VN',
    });

    expect(user.email).toBe('new@x.com');
    expect(user.role).toBe('hanah');
    expect(user.status).toBe('active');
    expect(user.emailVerifiedAt).toBeInstanceOf(Date);
    expect(user.passwordHash).not.toBe('Strong1234');
    expect(await bcrypt.compare('Strong1234', user.passwordHash)).toBe(true);
  });

  it('adminCreate() honours an explicit non-active status (no emailVerifiedAt)', async () => {
    const service = makeService();

    const user = await service.adminCreate({
      email: 'pending@x.com',
      password: 'Strong1234',
      fullName: 'Pending User',
      role: 'user',
      country: 'VN',
      status: 'pending_verify',
    });

    expect(user.status).toBe('pending_verify');
    expect(user.emailVerifiedAt).toBeNull();
  });

  it('adminCreate() rejects a duplicate email with EMAIL_TAKEN (409)', async () => {
    const service = makeService();
    await service.adminCreate({
      email: 'dup@x.com',
      password: 'Strong1234',
      fullName: 'Dup User',
      role: 'user',
      country: 'VN',
    });

    await expect(
      service.adminCreate({
        email: 'dup@x.com',
        password: 'Strong1234',
        fullName: 'Dup Two',
        role: 'user',
        country: 'VN',
      }),
    ).rejects.toMatchObject({ getStatus: expect.any(Function) });
  });

  it('list() filters by role, status and q, and paginates', async () => {
    const service = makeService();
    await seed(service);

    const byRole = await service.list({ role: 'tutor' });
    expect(byRole.total).toBe(1);
    expect(byRole.items[0].email).toBe('tutor@x.com');

    const byStatus = await service.list({ status: 'active' });
    expect(byStatus.total).toBe(3);

    const byQuery = await service.list({ q: 'plain' });
    expect(byQuery.total).toBe(1);
    expect(byQuery.items[0].email).toBe('user@x.com');

    const page = await service.list({ limit: 2, offset: 0 });
    expect(page.total).toBe(3);
    expect(page.items).toHaveLength(2);
  });

  it('delete() removes a user and throws NotFoundException when missing', async () => {
    const service = makeService();
    const { user } = await seed(service);

    await service.delete(user.id);
    expect(await service.findById(user.id)).toBeNull();

    await expect(service.delete(user.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('adminUpdate() sets emailVerifiedAt when flipping status to active', async () => {
    const service = makeService();
    const pending = await service.adminCreate({
      email: 'flip@x.com',
      password: 'Strong1234',
      fullName: 'Flip User',
      role: 'user',
      country: 'VN',
      status: 'pending_verify',
    });
    expect(pending.emailVerifiedAt).toBeNull();

    const updated = await service.adminUpdate(pending.id, { status: 'active' });
    expect(updated.status).toBe('active');
    expect(updated.emailVerifiedAt).toBeInstanceOf(Date);
  });

  it('adminUpdate() throws NotFoundException for unknown id', async () => {
    const service = makeService();

    await expect(
      service.adminUpdate('does-not-exist', { role: 'admin' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
