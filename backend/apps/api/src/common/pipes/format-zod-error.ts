import { ZodError } from 'zod';

export interface ZodIssueDetail {
  path: string;
  code: string;
  message: string;
}

/**
 * Map a ZodError into the standard validation error shape consumed by FE
 * (slide 18): a flat array of `{ path, code, message }`. `path` is the dotted
 * issue path (empty string for root-level issues).
 */
export function formatZodIssues(err: ZodError): ZodIssueDetail[] {
  return err.issues.map((issue) => ({
    path: issue.path.join('.'),
    code: issue.code,
    message: issue.message,
  }));
}
