import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';

import type { Env } from '../../config/env.validation';
import { MailService } from '../../notifications/mail.service';
import { UsersService } from '../users/users.service';
import type { User } from '../users/users.repository';

import { VERIFY_TOKEN_REPOSITORY } from './auth.constants';
import type { VerifyTokenRepository } from './auth.repository';
import type { SignupDtoType } from './dto/signup.dto';
import {
  generateVerifyToken,
  hashVerifyToken,
} from './verify-token.util';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly genericMessage =
    'Nếu email hợp lệ, chúng tôi đã gửi link verify';

  constructor(
    private readonly users: UsersService,
    @Inject(VERIFY_TOKEN_REPOSITORY)
    private readonly tokens: VerifyTokenRepository,
    private readonly mail: MailService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async signup(input: SignupDtoType): Promise<{ ok: true; message: string }> {
    const existing = await this.users.findByEmail(input.email);
    if (existing) {
      this.logger.warn({ event: 'auth.signup.duplicate', email: input.email });
      return { ok: true, message: this.genericMessage };
    }
    const cost = this.config.get('BCRYPT_COST', { infer: true });
    const passwordHash = await bcrypt.hash(input.password, cost);
    const user = await this.users.create({
      email: input.email,
      passwordHash,
      role: input.role,
      fullName: input.fullName,
      phone: input.phone ?? null,
      country: input.country,
    });
    await this.issueAndSendToken(user);
    this.logger.log({ event: 'auth.signup.ok', userId: user.id });
    return { ok: true, message: this.genericMessage };
  }

  async verify(rawToken: string): Promise<{ ok: true; message: string }> {
    const tokenHash = hashVerifyToken(rawToken);
    const record = await this.tokens.findValid(tokenHash, new Date());
    if (!record) {
      throw new BadRequestException('Token không hợp lệ hoặc đã hết hạn');
    }
    await this.users.update(record.userId, {
      status: 'active',
      emailVerifiedAt: new Date(),
    });
    await this.tokens.markUsed(record.id, new Date());
    this.logger.log({ event: 'auth.verify.ok', userId: record.userId });
    return { ok: true, message: 'Xác thực thành công, hãy đăng nhập' };
  }

  async resendVerify(email: string): Promise<{ ok: true; message: string }> {
    const generic = {
      ok: true as const,
      message: 'Nếu email hợp lệ, chúng tôi đã gửi lại link verify',
    };
    const user = await this.users.findByEmail(email);
    if (!user || user.status !== 'pending_verify') {
      this.logger.warn({ event: 'auth.resend.noop', email });
      return generic;
    }
    await this.tokens.invalidateAllForUser(user.id);
    await this.issueAndSendToken(user);
    this.logger.log({ event: 'auth.resend.ok', userId: user.id });
    return generic;
  }

  private async issueAndSendToken(user: User): Promise<void> {
    const { raw, hash } = generateVerifyToken();
    const ttlHours = this.config.get('VERIFY_TOKEN_TTL_HOURS', { infer: true });
    await this.tokens.create({
      userId: user.id,
      tokenHash: hash,
      expiresAt: new Date(Date.now() + ttlHours * 60 * 60 * 1000),
    });
    await this.mail.sendVerifyEmail(user.email, user.fullName, raw);
  }
}
