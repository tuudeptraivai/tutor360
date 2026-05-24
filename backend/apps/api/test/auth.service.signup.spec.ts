import 'reflect-metadata';

import type { ConfigService } from '@nestjs/config';
import type { Transporter } from 'nodemailer';
import * as bcrypt from 'bcrypt';
import { describe, expect, it, vi } from 'vitest';

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

describe('AuthService.signup', () => {
  it('hashes the password, creates the user and sends exactly one verify email', async () => {
    const { service, users, sendMail } = makeCtx();

    const res = await service.signup(validInput);

    expect(res).toEqual({ ok: true, message: expect.any(String) });
    expect(sendMail).toHaveBeenCalledTimes(1);

    const mailArg = sendMail.mock.calls[0][0];
    expect(mailArg.to).toBe('tu@x.com');
    expect(mailArg.html).toMatch(/token=[A-Za-z0-9\-_]+/);

    const user = await users.findByEmail('tu@x.com');
    expect(user).not.toBeNull();
    expect(user?.role).toBe('user');
    expect(user?.passwordHash).not.toBe(validInput.password);
    expect(await bcrypt.compare(validInput.password, user!.passwordHash)).toBe(
      true,
    );
  });

  it('does not leak on duplicate email: same generic response, no new user, no second email', async () => {
    const { service, users, sendMail } = makeCtx();

    const first = await service.signup(validInput);
    const second = await service.signup({ ...validInput, fullName: 'X' });

    expect(second).toEqual(first);
    expect(sendMail).toHaveBeenCalledTimes(1);

    const user = await users.findByEmail('tu@x.com');
    expect(user?.fullName).toBe('Tu Nguyen');
  });
});
