import 'reflect-metadata';

// ConfigModule validates env on init, so required vars must exist before compile.
process.env.DATABASE_URL ??=
  'postgresql://postgres:postgres@localhost:5432/tutor365?schema=public';
process.env.JWT_ACCESS_SECRET ??= 'a'.repeat(40);
process.env.JWT_REFRESH_SECRET ??= 'b'.repeat(40);
process.env.BCRYPT_COST = '4';

import { VersioningType, type INestApplication } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { ConfigModule } from '../src/config/config.module';
import { AuthModule } from '../src/modules/auth/auth.module';
import { MAIL_TRANSPORTER } from '../src/notifications/notifications.constants';

describe('AuthController (integration)', () => {
  let app: INestApplication;
  const sendMail = vi.fn().mockResolvedValue({});

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, AuthModule],
      providers: [{ provide: APP_INTERCEPTOR, useClass: TransformInterceptor }],
    })
      .overrideProvider(MAIL_TRANSPORTER)
      .useValue({ sendMail })
      .compile();

    app = moduleRef.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const validBody = {
    email: 'tu@example.com',
    password: 'Pass1234',
    fullName: 'Tu Nguyen',
    role: 'student',
  };

  it('POST /v1/auth/signup with a valid body returns 201 and a generic message', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/auth/signup')
      .send(validBody)
      .expect(201);

    expect(res.body.ok).toBe(true);
    expect(typeof res.body.data.message).toBe('string');
    expect(res.body.data.ok).toBe(true);
  });

  it('POST /v1/auth/signup missing password returns 400 VALIDATION_ERROR', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/auth/signup')
      .send({ email: 'a@b.com', fullName: 'Ab', role: 'student' })
      .expect(400);

    expect(res.body.ok).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('POST /v1/auth/signup twice with the same email both return 201 with the same message (no leak)', async () => {
    const first = await request(app.getHttpServer())
      .post('/v1/auth/signup')
      .send({ ...validBody, email: 'dup@example.com' })
      .expect(201);

    const second = await request(app.getHttpServer())
      .post('/v1/auth/signup')
      .send({ ...validBody, email: 'dup@example.com', fullName: 'X' })
      .expect(201);

    expect(second.body.data.message).toBe(first.body.data.message);
  });

  it('GET /v1/auth/verify with a valid token returns 200 and confirms verification', async () => {
    const email = 'verify-me@example.com';
    await request(app.getHttpServer())
      .post('/v1/auth/signup')
      .send({ ...validBody, email })
      .expect(201);

    const call = sendMail.mock.calls.find((c) => c[0].to === email);
    expect(call).toBeDefined();
    const html = call![0].html as string;
    const rawToken = decodeURIComponent(html.match(/token=([^"&]+)/)![1]);

    const res = await request(app.getHttpServer())
      .get(`/v1/auth/verify?token=${rawToken}`)
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body.data.message).toContain('Xác thực thành công');
  });

  it('GET /v1/auth/verify with a too-short token returns 400 VALIDATION_ERROR', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/auth/verify?token=tooshort')
      .expect(400);

    expect(res.body.ok).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('POST /v1/auth/resend-verify is rate-limited to 3 per window (4th -> 429)', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      const res = await request(app.getHttpServer())
        .post('/v1/auth/resend-verify')
        .send({ email: 'throttle@example.com' });
      statuses.push(res.status);
    }

    expect(statuses.slice(0, 3)).toEqual([202, 202, 202]);
    expect(statuses[3]).toBe(429);
  });
});
