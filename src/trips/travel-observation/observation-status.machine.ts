import type { ObservationPipelineStatus } from './observation.types';

const TERMINAL: ReadonlySet<ObservationPipelineStatus> = new Set([
  'COMPLETED',
  'UPLOAD_FAILED',
  'IMAGE_INVALID',
  'CONTEXT_MISSING',
  'MODEL_FAILED',
  'ASSESSMENT_FAILED',
  'CANCELLED',
]);

const ALLOWED: Record<ObservationPipelineStatus, ObservationPipelineStatus[]> = {
  DRAFT: ['UPLOADING', 'CANCELLED'],
  UPLOADING: ['EXTRACTING', 'UPLOAD_FAILED', 'CANCELLED'],
  EXTRACTING: ['GROUNDING', 'IMAGE_INVALID', 'MODEL_FAILED', 'CANCELLED'],
  MEDIA_APPENDED: ['EXTRACTING', 'CANCELLED'],
  GROUNDING: ['ASSESSING', 'CONTEXT_MISSING', 'ASSESSMENT_FAILED', 'CANCELLED'],
  ASSESSING: ['COMPLETED', 'ASSESSMENT_FAILED', 'CANCELLED'],
  COMPLETED: ['MEDIA_APPENDED'], // recapture reopen
  UPLOAD_FAILED: ['UPLOADING', 'CANCELLED'],
  IMAGE_INVALID: ['MEDIA_APPENDED', 'CANCELLED'],
  CONTEXT_MISSING: ['MEDIA_APPENDED', 'GROUNDING', 'CANCELLED'],
  MODEL_FAILED: ['EXTRACTING', 'MEDIA_APPENDED', 'CANCELLED'],
  ASSESSMENT_FAILED: ['ASSESSING', 'MEDIA_APPENDED', 'CANCELLED'],
  CANCELLED: [],
};

export function isTerminalStatus(status: ObservationPipelineStatus): boolean {
  return TERMINAL.has(status);
}

export function canTransition(
  from: ObservationPipelineStatus,
  to: ObservationPipelineStatus,
): boolean {
  if (from === to) return true;
  return (ALLOWED[from] ?? []).includes(to);
}

export function assertTransition(
  from: ObservationPipelineStatus,
  to: ObservationPipelineStatus,
): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid observation status transition: ${from} → ${to}`);
  }
}

export function isAssessmentReadable(status: ObservationPipelineStatus): boolean {
  return status === 'COMPLETED';
}
