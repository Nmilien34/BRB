import { z } from 'zod';

export const startAuthBodySchema = z.object({
  name: z.string().trim().min(1).max(120).optional().default('User'),
  email: z.string().trim().toLowerCase().email().max(255),
});

export type StartAuthBody = z.infer<typeof startAuthBodySchema>;
