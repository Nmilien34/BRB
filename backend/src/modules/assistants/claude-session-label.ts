import { logger } from '../../utils/index.js';

export interface ClaudeSessionLabelPayload {
  sessionTitle?: string;
  cwd?: string;
  transcriptPath?: string;
  sessionId?: string;
}

function getLastPathSegment(pathValue: string): string | undefined {
  const trimmed = pathValue.trim().replace(/[\\/]+$/, '');

  if (!trimmed) {
    return undefined;
  }

  const segments = trimmed.split(/[\\/]/).filter(Boolean);
  const lastSegment = segments.at(-1);

  return lastSegment && lastSegment !== '.' ? lastSegment : undefined;
}

function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '');
}

export function deriveSessionLabel(payload: ClaudeSessionLabelPayload): string {
  if (payload.sessionTitle?.trim()) {
    return payload.sessionTitle.trim();
  }

  if (payload.cwd) {
    const cwdLabel = getLastPathSegment(payload.cwd);

    if (cwdLabel) {
      logger.info({ cwd: payload.cwd, sessionLabel: cwdLabel }, 'Claude session label derived from cwd');
      return cwdLabel;
    }
  }

  if (payload.transcriptPath) {
    const transcriptLabel = getLastPathSegment(payload.transcriptPath);

    if (transcriptLabel) {
      const normalizedTranscriptLabel = stripExtension(transcriptLabel);

      logger.info(
        { transcriptPath: payload.transcriptPath, sessionLabel: normalizedTranscriptLabel },
        'Claude session label derived from transcriptPath',
      );

      return normalizedTranscriptLabel;
    }
  }

  const fallbackLabel = payload.sessionId?.trim()
    ? `session ${payload.sessionId.trim().slice(0, 8)}`
    : 'Claude session';

  logger.info(
    { sessionId: payload.sessionId ?? null, sessionLabel: fallbackLabel },
    'Claude session label fallback used',
  );

  return fallbackLabel;
}
