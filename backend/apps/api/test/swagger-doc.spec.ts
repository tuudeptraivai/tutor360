import 'reflect-metadata';

// ConfigModule validates env on init, so required vars must exist before compile.
process.env.DATABASE_URL ??=
  'postgresql://postgres:postgres@localhost:5432/tutor365?schema=public';
process.env.JWT_ACCESS_SECRET ??= 'a'.repeat(40);
process.env.JWT_REFRESH_SECRET ??= 'b'.repeat(40);
process.env.BCRYPT_COST = '4';

import { VersioningType, type INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { AppModule } from '../src/app.module';
import { extractObjectFields, zodToOpenApi } from '../src/common/openapi';
import { MAIL_TRANSPORTER } from '../src/notifications/notifications.constants';

describe('zodToOpenApi / extractObjectFields (unit)', () => {
  it('extractObjectFields reports required vs optional top-level fields', () => {
    const fields = extractObjectFields(
      z.object({ page: z.coerce.number().optional(), q: z.string() }),
    );
    const byName = Object.fromEntries(fields.map((f) => [f.name, f]));
    expect(byName.page.required).toBe(false);
    expect(byName.q.required).toBe(true);
  });

  it('zodToOpenApi preserves string format (email)', () => {
    const schema = zodToOpenApi(z.object({ a: z.string().email() })) as {
      properties: { a: { type: string; format: string } };
    };
    expect(schema.properties.a.type).toBe('string');
    expect(schema.properties.a.format).toBe('email');
  });
});

describe('OpenAPI document (integration)', () => {
  let app: INestApplication;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let doc: any;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MAIL_TRANSPORTER)
      .useValue({ sendMail: async () => ({}) })
      .compile();

    app = moduleRef.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

    const config = new DocumentBuilder()
      .setTitle('Tutor365 API')
      .setDescription('Tutor365 backend API documentation')
      .setVersion('1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'bearer')
      .addServer('http://localhost:3000', 'local dev')
      .build();

    // Build the document without app.init() so no DB connection is required.
    doc = SwaggerModule.createDocument(app, config);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('exposes a valid OpenAPI 3 document with info + paths', () => {
    expect(doc.info.title).toBe('Tutor365 API');
    expect(doc.paths).toBeDefined();
  });

  it('POST /v1/courses documents the request body schema', () => {
    const schema =
      doc.paths['/v1/courses'].post.requestBody.content['application/json']
        .schema;
    expect(schema.required).toEqual(
      expect.arrayContaining(['slug', 'title', 'price', 'tutorId']),
    );
    expect(schema.properties.price).toBeDefined();
  });

  it('GET /v1/courses/{id} documents the path param', () => {
    const params = doc.paths['/v1/courses/{id}'].get.parameters;
    expect(params).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'id', in: 'path', required: true }),
      ]),
    );
  });

  it('POST /v1/courses documents success + error envelopes', () => {
    const ok =
      doc.paths['/v1/courses'].post.responses['201'].content['application/json']
        .schema;
    expect(ok.properties.ok.enum).toEqual([true]);

    const err =
      doc.paths['/v1/courses'].post.responses['400'].content['application/json']
        .schema;
    expect(err.properties.ok.enum).toEqual([false]);
  });

  it('GET /health is documented with a 200 response', () => {
    expect(doc.paths['/health'].get.responses['200']).toBeDefined();
  });

  it('POST /v1/auth/signup documents the body schema (V06 merged)', () => {
    const schema =
      doc.paths['/v1/auth/signup'].post.requestBody.content['application/json']
        .schema;
    expect(schema.required).toEqual(
      expect.arrayContaining(['email', 'password', 'fullName', 'role']),
    );
  });
});
