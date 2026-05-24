import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { ClsServiceManager } from 'nestjs-cls';
import { ZodError } from 'zod';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse();
    const req = ctx.getRequest();
    const requestId = ClsServiceManager.getClsService().getId() ?? req.id;

    if (exception instanceof ZodError) {
      res.status(400).json({
        ok: false,
        error: { code: 'VALIDATION_ERROR', details: exception.flatten() },
        requestId,
      });
      return;
    }

    if (exception instanceof HttpException) {
      res.status(exception.getStatus()).json({
        ok: false,
        error: { code: 'HTTP_ERROR', message: exception.message },
        requestId,
      });
      return;
    }

    this.logger.error(exception);
    res.status(500).json({
      ok: false,
      error: { code: 'INTERNAL' },
      requestId,
    });
  }
}
