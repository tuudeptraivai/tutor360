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

describe('Admin Users CRUD (e2e)', () => {
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

  it('create → list → delete with a valid x-admin-token', async () => {
    const url = '/v1/admin/users';
    const headers = { 'x-admin-token': TOKEN };

    const created = await request(app.getHttpServer())
      .post(url)
      .set(headers)
      .send({
        email: 'hanah@tutor365.local',
        password: 'Strong1234',
        fullName: 'Hanah',
        role: 'hanah',
        country: 'VN',
      })
      .expect(201);

    const id = created.body.data.id as string;
    expect(created.body.data.role).toBe('hanah');
    expect(created.body.data.status).toBe('active');
    expect(created.body.data.passwordHash).toBeUndefined();

    const listed = await request(app.getHttpServer())
      .get(`${url}?role=hanah`)
      .set(headers)
      .expect(200);
    expect(listed.body.data.total).toBe(1);
    expect(listed.body.data.items[0].id).toBe(id);

    await request(app.getHttpServer())
      .delete(`${url}/${id}`)
      .set(headers)
      .expect(204);

    await request(app.getHttpServer())
      .get(`${url}/${id}`)
      .set(headers)
      .expect(404);
  });

  it('blocks access without the token (401)', async () => {
    await request(app.getHttpServer()).get('/v1/admin/users').expect(401);
  });
});
