import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';

import { NotificationsModule } from '../../notifications/notifications.module';
import { UsersModule } from '../users/users.module';

import { VERIFY_TOKEN_REPOSITORY } from './auth.constants';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { InMemoryVerifyTokenRepository } from './repositories/in-memory-verify-token.repository';

@Module({
  imports: [
    UsersModule,
    NotificationsModule,
    // Throttler cục bộ để @UseGuards(ThrottlerGuard) trên route resend-verify
    // có thể giải DI khi AuthModule chạy độc lập (vd. trong spec).
    ThrottlerModule.forRoot([{ ttl: 600_000, limit: 3 }]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    { provide: VERIFY_TOKEN_REPOSITORY, useClass: InMemoryVerifyTokenRepository },
  ],
  exports: [AuthService],
})
export class AuthModule {}
