import {
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';

import { Public, ZodBody, ZodQuery } from '../../common/decorators';

import { AuthService } from './auth.service';
import { SignupDto, type SignupDtoType } from './dto/signup.dto';
import {
  ResendVerifyDto,
  type ResendVerifyDtoType,
} from './dto/resend-verify.dto';
import { VerifyQueryDto, type VerifyQueryDtoType } from './dto/verify.query';

@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly service: AuthService) {}

  @Public()
  @Post('signup')
  @HttpCode(201)
  signup(
    @ZodBody(SignupDto) body: SignupDtoType,
  ): Promise<{ ok: true; message: string }> {
    return this.service.signup(body);
  }

  @Public()
  @Get('verify')
  verify(
    @ZodQuery(VerifyQueryDto) { token }: VerifyQueryDtoType,
  ): Promise<{ ok: true; message: string }> {
    return this.service.verify(token);
  }

  @Public()
  @Post('resend-verify')
  @HttpCode(202)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 600_000, limit: 3 } }) // 3 / 10 phút (slide 15)
  resend(
    @ZodBody(ResendVerifyDto) body: ResendVerifyDtoType,
  ): Promise<{ ok: true; message: string }> {
    return this.service.resendVerify(body.email);
  }
}
