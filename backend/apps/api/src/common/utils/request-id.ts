import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

/**
 * Resolve a request id shared by CLS, pino-http and RequestIdMiddleware.
 *
 * Reads the `x-request-id` header (first value if repeated) and falls back to
 * `randomUUID()`. Centralised here so every layer derives the same id.
 */
export const resolveRequestId = (req: IncomingMessage): string => {
  const header = req.headers['x-request-id'];
  const fromHeader = Array.isArray(header) ? header[0] : header;
  return fromHeader && fromHeader.length > 0 ? fromHeader : randomUUID();
};
