import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response } from 'express';

import { resolveRequestId } from '../utils/request-id';

type RequestWithId = Request & { id?: string };

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: RequestWithId, res: Response, next: () => void): void {
    const existing = req.id;
    const id =
      typeof existing === 'string' && existing.length > 0
        ? existing
        : resolveRequestId(req);
    req.id = id;
    res.setHeader('X-Request-Id', id);
    next();
  }
}
