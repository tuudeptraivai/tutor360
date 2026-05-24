import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Transporter } from 'nodemailer';

import type { Env } from '../config/env.validation';

import { MAIL_TRANSPORTER } from './notifications.constants';

/** Escape `<>&"'` để chống XSS khi nhúng dữ liệu người dùng vào HTML email. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    @Inject(MAIL_TRANSPORTER) private readonly transporter: Transporter,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async sendVerifyEmail(
    to: string,
    fullName: string,
    rawToken: string,
  ): Promise<void> {
    const appUrl = this.config.get('APP_URL', { infer: true });
    const link = `${appUrl}/v1/auth/verify?token=${encodeURIComponent(rawToken)}`;
    await this.transporter.sendMail({
      from: this.config.get('SMTP_FROM', { infer: true }),
      to,
      subject: 'Xác thực tài khoản Tutor365',
      html: `<p>Xin chào ${escapeHtml(fullName)},</p><p>Click <a href="${link}">đây</a> để xác thực (link sống 24h).</p>`,
    });
    this.logger.log({ event: 'mail.verify.sent', to });
  }
}
