import { z } from 'zod';

import { VERIFY_TOKEN_MIN_LENGTH } from '../auth.constants';

export const VerifyQueryDto = z.object({
  token: z.string().min(VERIFY_TOKEN_MIN_LENGTH).max(128),
});

export type VerifyQueryDtoType = z.infer<typeof VerifyQueryDto>;
