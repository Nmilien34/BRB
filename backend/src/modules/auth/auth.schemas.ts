import { z } from 'zod';

export const requestCodeBodySchema = z.object({
  phone: z.string().trim().min(1).max(32),
});

export const verifyCodeBodySchema = z.object({
  phone: z.string().trim().min(1).max(32),
  code: z.string().trim().regex(/^\d{6}$/),
});

export type RequestCodeBody = z.infer<typeof requestCodeBodySchema>;
export type VerifyCodeBody = z.infer<typeof verifyCodeBodySchema>;
