import { VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { z } from 'zod';

import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { viErrorMap } from './common/zod/vi-error-map';

// Set Vietnamese Zod error messages once for the whole app.
z.setErrorMap(viErrorMap);

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Global logger (nestjs-pino)
  app.useLogger(app.get(Logger));

  // Security headers
  app.use(helmet());

  // CORS whitelist từ env CORS_ORIGINS (phân tách bằng dấu phẩy)
  const corsOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : false,
    credentials: true,
  });

  // URI versioning -> /v1/...
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // Global exception filter -> JSON format thống nhất + requestId
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Graceful shutdown hooks
  app.enableShutdownHooks();

  // Swagger UI tại /api/docs — chỉ bật ở môi trường non-production
  if (process.env.NODE_ENV !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Tutor365 API')
      .setDescription(
        'Tutor365 backend API documentation. Tất cả response bọc envelope `{ ok, data, requestId }`.',
      )
      .setVersion('1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'bearer')
      .addServer('http://localhost:3000', 'local dev')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);

  const logger = app.get(Logger);
  logger.log(`🚀 Tutor365 API listening on http://localhost:${port}`);
  if (process.env.NODE_ENV !== 'production') {
    logger.log(`📚 Swagger UI: http://localhost:${port}/api/docs`);
  }
}

void bootstrap();
