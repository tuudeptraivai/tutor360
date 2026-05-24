import 'reflect-metadata';

import type { INestApplication } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { CoursesModule } from '../src/modules/courses/courses.module';

describe('CoursesController (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [CoursesModule],
      providers: [{ provide: APP_INTERCEPTOR, useClass: TransformInterceptor }],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const validBody = {
    slug: 'toan-10',
    title: 'Toán 10 cơ bản',
    price: 500_000,
    tutorId: '11111111-1111-1111-1111-111111111111',
  };

  it('POST /courses with a valid body returns 201 and the created course', async () => {
    const res = await request(app.getHttpServer())
      .post('/courses')
      .send(validBody)
      .expect(201);

    expect(res.body.ok).toBe(true);
    expect(res.body.data.slug).toBe('toan-10');
    expect(res.body.data.status).toBe('draft');
    expect(typeof res.body.data.id).toBe('string');
  });

  it('POST /courses with a negative price returns 400 VALIDATION_ERROR', async () => {
    const res = await request(app.getHttpServer())
      .post('/courses')
      .send({ slug: 'xxx', title: 'Yyy', price: -1, tutorId: 'not-uuid' })
      .expect(400);

    expect(res.body.ok).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'price' }),
      ]),
    );
  });

  it('GET /courses/:id returns 200 with the stored course', async () => {
    const created = await request(app.getHttpServer())
      .post('/courses')
      .send(validBody)
      .expect(201);

    const id = created.body.data.id as string;

    const res = await request(app.getHttpServer())
      .get(`/courses/${id}`)
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body.data.title).toBe(validBody.title);
  });

  it('GET /courses/:id returns 404 for an unknown id', async () => {
    const res = await request(app.getHttpServer())
      .get('/courses/non-exist')
      .expect(404);

    expect(res.body.ok).toBe(false);
    expect(res.body.error.code).toBe('HTTP_ERROR');
  });
});
