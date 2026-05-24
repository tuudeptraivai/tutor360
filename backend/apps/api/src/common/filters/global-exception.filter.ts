import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { ClsServiceManager } from 'nestjs-cls';
import { ZodError } from 'zod';

import { formatZodIssues } from '../pipes/format-zod-error';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse();
    const req = ctx.getRequest();
    const requestId = ClsServiceManager.getClsService().getId() ?? req.id;
    const path = req.url;

    if (exception instanceof ZodError) {
      res.status(400).json({
        ok: false,
        error: { code: 'VALIDATION_ERROR', details: formatZodIssues(exception) },
        requestId,
        path,
      });
      return;
    }

    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      // Pipes throw `{ code, details }` (e.g. VALIDATION_ERROR). Unwrap that
      // shape so the structured error survives instead of being collapsed
      // into a generic HTTP_ERROR message.
      const error =
        typeof response === 'object' && response !== null && 'code' in response
          ? (response as { code: string; details?: unknown })
          : { code: 'HTTP_ERROR', message: exception.message };

      res.status(exception.getStatus()).json({
        ok: false,
        error,
        requestId,
        path,
      });
      return;
    }

    this.logger.error(exception);
    res.status(500).json({
      ok: false,
      error: { code: 'INTERNAL' },
      requestId,
      path,
    });
  }
}
