import { z } from 'zod';

/**
 * Vietnamese error map (slide 13). Set once via `z.setErrorMap(viErrorMap)` in
 * `main.ts` so every schema produces Vietnamese messages without per-field
 * overrides. Unhandled cases fall back to Zod's default message.
 */
export const viErrorMap: z.ZodErrorMap = (issue, ctx) => {
  switch (issue.code) {
    case z.ZodIssueCode.invalid_type:
      return { message: `Phải là ${issue.expected}` };
    case z.ZodIssueCode.too_small:
      return { message: `Tối thiểu ${issue.minimum} ký tự` };
    case z.ZodIssueCode.too_big:
      return { message: `Tối đa ${issue.maximum} ký tự` };
    case z.ZodIssueCode.invalid_string:
      if (issue.validation === 'email') {
        return { message: 'Email không hợp lệ' };
      }
      if (issue.validation === 'uuid') {
        return { message: 'ID không đúng định dạng' };
      }
      return { message: ctx.defaultError };
    default:
      return { message: ctx.defaultError };
  }
};
