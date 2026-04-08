import { z } from 'zod';

export const bridgeConnectBodySchema = z
  .object({
    machineName: z.string().trim().min(1).max(128).optional(),
    installedHookVersion: z.string().trim().min(1).max(64).optional(),
    cwd: z.string().trim().min(1).max(4096).optional(),
    projectPath: z.string().trim().min(1).max(4096).optional(),
    project_path: z.string().trim().min(1).max(4096).optional(),
  })
  .passthrough();

export const bridgeEventBodySchema = z
  .object({
    hookEventName: z.string().trim().min(1).max(128).optional(),
    eventName: z.string().trim().min(1).max(128).optional(),
    hook_event_name: z.string().trim().min(1).max(128).optional(),
    toolName: z.string().trim().min(1).max(256).optional(),
    tool_name: z.string().trim().min(1).max(256).optional(),
    sessionId: z.string().trim().min(1).max(256).optional(),
    session_id: z.string().trim().min(1).max(256).optional(),
    sessionTitle: z.string().trim().min(1).max(256).optional(),
    session_title: z.string().trim().min(1).max(256).optional(),
    cwd: z.string().trim().min(1).max(4096).optional(),
    projectPath: z.string().trim().min(1).max(4096).optional(),
    project_path: z.string().trim().min(1).max(4096).optional(),
    transcriptPath: z.string().trim().min(1).max(4096).optional(),
    transcript_path: z.string().trim().min(1).max(4096).optional(),
    error: z.string().trim().min(1).max(1024).optional(),
  })
  .passthrough();

export const bridgeApprovalParamsSchema = z.object({
  approvalId: z.string().trim().regex(/^[0-9a-fA-F]{24}$/),
});

export type BridgeConnectBody = z.infer<typeof bridgeConnectBodySchema>;
export type BridgeEventBody = z.infer<typeof bridgeEventBodySchema>;
export type BridgeApprovalParams = z.infer<typeof bridgeApprovalParamsSchema>;
