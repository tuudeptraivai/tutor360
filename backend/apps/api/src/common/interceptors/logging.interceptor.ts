import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Observable, tap } from 'rxjs';

type RequestWithId = Request & { id?: string };

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(
    @InjectPinoLogger(LoggingInterceptor.name)
    private readonly logger: PinoLogger,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<RequestWithId>();
    const res = ctx.switchToHttp().getResponse<Response>();
    const start = Date.now();
    const reqId = String(req.id ?? '');

    return next.handle().pipe(
      tap({
        next: () => {
          const ms = Date.now() - start;
          this.logger.info(
            `${req.method} ${req.url} ${res.statusCode} in ${ms}ms (req=${reqId})`,
          );
        },
        error: (err: unknown) => {
          const ms = Date.now() - start;
          const message = err instanceof Error ? err.message : String(err);
          this.logger.error(
            `${req.method} ${req.url} ERROR in ${ms}ms (req=${reqId}): ${message}`,
          );
        },
      }),
    );
  }
}
