import 'reflect-metadata';

// ConfigModule validates env on init, so required vars must exist before compile.
process.env.DATABASE_URL ??=
  'postgresql://postgres:postgres@localhost:5432/tutor365?schema=public';
process.env.JWT_ACCESS_SECRET ??= 'a'.repeat(40);
process.env.JWT_REFRESH_SECRET ??= 'b'.repeat(40);
process.env.BCRYPT_COST = '4';
process.env.ADMIN_BOOTSTRAP_TOKEN = 'test-admin-token-'.padEnd(40, '0');

import { VersioningType, type INestApplication } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { ConfigModule } from '../src/config/config.module';
import { UsersModule } from '../src/modules/users/users.module';

const TOKEN = process.env.ADMIN_BOOTSTRAP_TOKEN as string;

function adminUser(overrides: Record<string, unknown> = {}) {
  return {
    email: 'created@example.com',
    password: 'Strong1234',
    fullName: 'Created User',
    role: 'user',
    country: 'VN',
    ...overrides,
  };
}

describe('AdminUsersController (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, UsersModule],
      providers: [{ provide: APP_INTERCEPTOR, useClass: TransformInterceptor }],
    }).compile();

    app = moduleRef.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const url = '/v1/admin/users';
  const auth = () => ({ 'x-admin-token': TOKEN });

  it('rejects requests without a token (401)', async () => {
    await request(app.getHttpServer()).get(url).expect(401);
  });

  it('rejects requests with a wrong token (401)', async () => {
    await request(app.getHttpServer())
      .get(url)
      .set('x-admin-token', 'nope')
      .expect(401);
  });

  it('creates a user for each role and never returns passwordHash', async () => {
    for (const role of ['user', 'tutor', 'admin', 'hanah'] as const) {
      const res = await request(app.getHttpServer())
        .post(url)
        .set(auth())
        .send(adminUser({ email: `${role}@example.com`, role }))
        .expect(201);

      expect(res.body.ok).toBe(true);
      expect(res.body.data.role).toBe(role);
      expect(res.body.data.status).toBe('active');
      expect(res.body.data.emailVerifiedAt).not.toBeNull();
      expect(res.body.data.passwordHash).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    }
  });

  it('lists users with filter + pagination envelope', async () => {
    const res = await request(app.getHttpServer())
      .get(`${url}?role=user&limit=10&offset=0`)
      .set(auth())
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body.data.limit).toBe(10);
    expect(res.body.data.offset).toBe(0);
    expect(res.body.data.total).toBeGreaterThanOrEqual(1);
    expect(res.body.data.items.every((u: { role: string }) => u.role === 'user')).toBe(true);
  });

  it('gets, updates the role of, and deletes a user', async () => {
    const created = await request(app.getHttpServer())
      .post(url)
      .set(auth())
      .send(adminUser({ email: 'crud@example.com', role: 'user' }))
      .expect(201);
    const id = created.body.data.id as string;

    const got = await request(app.getHttpServer())
      .get(`${url}/${id}`)
      .set(auth())
      .expect(200);
    expect(got.body.data.email).toBe('crud@example.com');

    const patched = await request(app.getHttpServer())
      .patch(`${url}/${id}`)
      .set(auth())
      .send({ role: 'tutor' })
      .expect(200);
    expect(patched.body.data.role).toBe('tutor');

    await request(app.getHttpServer())
      .delete(`${url}/${id}`)
      .set(auth())
      .expect(204);

    await request(app.getHttpServer())
      .get(`${url}/${id}`)
      .set(auth())
      .expect(404);
  });

  it('rejects a duplicate email with 409 EMAIL_TAKEN', async () => {
    await request(app.getHttpServer())
      .post(url)
      .set(auth())
      .send(adminUser({ email: 'taken@example.com' }))
      .expect(201);

    const res = await request(app.getHttpServer())
      .post(url)
      .set(auth())
      .send(adminUser({ email: 'taken@example.com' }))
      .expect(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('rejects an empty patch body (400)', async () => {
    const created = await request(app.getHttpServer())
      .post(url)
      .set(auth())
      .send(adminUser({ email: 'empty-patch@example.com' }))
      .expect(201);

    await request(app.getHttpServer())
      .patch(`${url}/${created.body.data.id}`)
      .set(auth())
      .send({})
      .expect(400);
  });
});
