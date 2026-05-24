import 'reflect-metadata';

import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Transporter } from 'nodemailer';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Env } from '../src/config/env.validation';
import { MailService } from '../src/notifications/mail.service';
import { AuthService } from '../src/modules/auth/auth.service';
import { InMemoryVerifyTokenRepository } from '../src/modules/auth/repositories/in-memory-verify-token.repository';
import { InMemoryUsersRepository } from '../src/modules/users/repositories/in-memory-users.repository';
import { UsersService } from '../src/modules/users/users.service';

const fakeConfig = {
  get: (key: string) =>
    ({
      BCRYPT_COST: 4,
      VERIFY_TOKEN_TTL_HOURS: 24,
      APP_URL: 'http://localhost:3000',
      SMTP_FROM: 'noreply@tutor365.local',
    })[key],
} as unknown as ConfigService<Env, true>;

function makeCtx() {
  const sendMail = vi.fn().mockResolvedValue({});
  const transporter = { sendMail } as unknown as Transporter;
  const usersRepo = new InMemoryUsersRepository();
  const users = new UsersService(usersRepo, fakeConfig);
  const mail = new MailService(transporter, fakeConfig);
  const service = new AuthService(
    users,
    new InMemoryVerifyTokenRepository(),
    mail,
    fakeConfig,
  );
  return { service, users, sendMail };
}

const validInput = {
  email: 'tu@x.com',
  password: 'Pass1234',
  fullName: 'Tu Nguyen',
  country: 'VN',
};

function extractRawToken(sendMail: ReturnType<typeof vi.fn>): string {
  const html = sendMail.mock.calls[0][0].html as string;
  const match = html.match(/token=([^"&]+)/);
  if (!match) {
    throw new Error('verify token not found in email html');
  }
  return decodeURIComponent(match[1]);
}

describe('AuthService.verify', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('verifies a fresh token, activates the user, and is single-use', async () => {
    const { service, users, sendMail } = makeCtx();
    await service.signup(validInput);
    const raw = extractRawToken(sendMail);

    const res = await service.verify(raw);
    expect(res.ok).toBe(true);
    expect(res.message).toContain('Xác thực thành công');

    const user = await users.findByEmail('tu@x.com');
    expect(user?.status).toBe('active');
    expect(user?.emailVerifiedAt).toBeInstanceOf(Date);

    await expect(service.verify(raw)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects an unknown token', async () => {
    const { service } = makeCtx();

    await expect(
      service.verify('wrong-token-of-min-length-................'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an expired token (advance 25h)', async () => {
    vi.useFakeTimers();
    const { service, sendMail } = makeCtx();
    await service.signup(validInput);
    const raw = extractRawToken(sendMail);

    vi.advanceTimersByTime(25 * 60 * 60 * 1000);

    await expect(service.verify(raw)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
