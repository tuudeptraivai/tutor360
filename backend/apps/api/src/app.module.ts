import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

import { Module } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { ClsModule } from 'nestjs-cls';
import { LoggerModule } from 'nestjs-pino';

import { ZodGlobalValidationPipe } from './common/pipes/zod-global-validation.pipe';
import { ConfigModule } from './config/config.module';
import { HealthModule } from './health/health.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PrismaModule } from './prisma/prisma.module';

import { AssignmentsModule } from './modules/assignments/assignments.module';
import { AuthModule } from './modules/auth/auth.module';
import { AvailabilitiesModule } from './modules/availabilities/availabilities.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import { CalendarModule } from './modules/calendar/calendar.module';
import { CoursesModule } from './modules/courses/courses.module';
import { EnrollmentsModule } from './modules/enrollments/enrollments.module';
import { MeetingsModule } from './modules/meetings/meetings.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { PayoutsModule } from './modules/payouts/payouts.module';
import { StudentsModule } from './modules/students/students.module';
import { TaxonomyModule } from './modules/taxonomy/taxonomy.module';
import { TutorsModule } from './modules/tutors/tutors.module';
import { UsersModule } from './modules/users/users.module';

const resolveRequestId = (req: IncomingMessage): string => {
  const header = req.headers['x-request-id'];
  const fromHeader = Array.isArray(header) ? header[0] : header;
  return fromHeader && fromHeader.length > 0 ? fromHeader : randomUUID();
};

@Module({
  imports: [
    // Infrastructure
    ConfigModule,
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
        generateId: true,
        idGenerator: (req: IncomingMessage) => resolveRequestId(req),
      },
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        genReqId: (req) => resolveRequestId(req as IncomingMessage),
        transport:
          process.env.NODE_ENV === 'production'
            ? undefined
            : { target: 'pino-pretty', options: { singleLine: true } },
      },
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 100,
      },
    ]),
    PrismaModule,
    NotificationsModule,
    HealthModule,

    // Domain modules (Slide 5 — module map)
    AuthModule,
    UsersModule,
    TutorsModule,
    StudentsModule,
    TaxonomyModule,
    CoursesModule,
    EnrollmentsModule,
    AvailabilitiesModule,
    BookingsModule,
    AssignmentsModule,
    MeetingsModule,
    CalendarModule,
    PaymentsModule,
    PayoutsModule,
  ],
  providers: [
    {
      provide: APP_PIPE,
      useClass: ZodGlobalValidationPipe,
    },
  ],
})
export class AppModule {}
