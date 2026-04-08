import { z } from 'zod';

const telegramUserSchema = z
  .object({
    id: z.union([z.number(), z.string()]),
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    username: z.string().optional(),
  })
  .passthrough();

const telegramChatSchema = z
  .object({
    id: z.union([z.number(), z.string()]),
  })
  .passthrough();

const telegramMessageSchema = z
  .object({
    text: z.string().optional(),
    from: telegramUserSchema.optional(),
    chat: telegramChatSchema.optional(),
  })
  .passthrough();

export const telegramWebhookParamsSchema = z.object({
  secret: z.string().trim().min(1),
});

export const telegramWebhookUpdateSchema = z
  .object({
    update_id: z.number().optional(),
    message: telegramMessageSchema.optional(),
    edited_message: telegramMessageSchema.optional(),
  })
  .passthrough();

export type TelegramWebhookParams = z.infer<typeof telegramWebhookParamsSchema>;
export type TelegramWebhookUpdate = z.infer<typeof telegramWebhookUpdateSchema>;
