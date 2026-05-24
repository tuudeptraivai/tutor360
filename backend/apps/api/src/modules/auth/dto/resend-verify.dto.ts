import { z } from 'zod';

export const ResendVerifyDto = z.object({
  email: z.string().trim().toLowerCase().email(),
});

export type ResendVerifyDtoType = z.infer<typeof ResendVerifyDto>;
