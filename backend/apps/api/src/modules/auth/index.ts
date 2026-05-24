export { AuthModule } from './auth.module';
export { AuthService } from './auth.service';
export { VERIFY_TOKEN_REPOSITORY } from './auth.constants';
export type {
  VerifyTokenRepository,
  EmailVerifyToken,
} from './auth.repository';
export { SignupDto } from './dto/signup.dto';
export { VerifyQueryDto } from './dto/verify.query';
export { ResendVerifyDto } from './dto/resend-verify.dto';
// Internal repo impl (InMemoryVerifyTokenRepository) intentionally NOT exported.
