import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport } from 'nodemailer';

import type { Env } from '../config/env.validation';

import { MailService } from './mail.service';
import { MAIL_TRANSPORTER } from './notifications.constants';

@Module({
  providers: [
    {
      provide: MAIL_TRANSPORTER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        createTransport({
          host: config.get('SMTP_HOST', { infer: true }),
          port: config.get('SMTP_PORT', { infer: true }),
          secure: false,
        }),
    },
    MailService,
  ],
  exports: [MailService],
})
export class NotificationsModule {}
