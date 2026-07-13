/**
 * Attention Level assignment and upward-only escalation.
 */

import {
  ATTENTION_LEVEL_ORDER,
  type AttentionLevel,
  type AttentionOrchestrationProblemInput,
  type RootCauseClusterStatus,
} from '../contracts/attention-orchestration.types';

const TERMINAL_STATUSES = new Set(['RESOLVED', 'FAILED']);

export function computeAttentionLevelForProblems(
  problems: AttentionOrchestrationProblemInput[],
  status: RootCauseClusterStatus,
): AttentionLevel {
  if (status === 'ACKNOWLEDGED' || status === 'RESOLVED') {
    return 'SILENT';
  }

  const open = problems.filter((p) => !TERMINAL_STATUSES.has(p.status));
  if (open.length === 0) return 'SILENT';

  const capabilities = new Set(open.map((p) => p.semanticCapability));

  if (
    capabilities.has('ROAD_CLOSED') ||
    capabilities.has('ROAD_SEGMENT_UNAVAILABLE')
  ) {
    const hasHardBlock = open.some(
      (p) =>
        p.urgency === 'CRITICAL' &&
        (p.semanticCapability === 'ROAD_CLOSED' ||
          p.semanticCapability === 'ROAD_SEGMENT_UNAVAILABLE'),
    );
    if (hasHardBlock) return 'SAFETY_STOP';
  }

  if (capabilities.has('NIGHT_DRIVING_RISK')) {
    const night = open.find((p) => p.semanticCapability === 'NIGHT_DRIVING_RISK');
    if (night?.urgency === 'CRITICAL') {
      return 'SAFETY_STOP';
    }
  }

  if (capabilities.has('EXECUTION_SCHEDULE_INFEASIBLE')) {
    return 'INTERRUPT';
  }

  if (capabilities.has('ACTIVITY_WINDOW_MISSED')) {
    return 'INTERRUPT';
  }

  if (
    capabilities.has('EXECUTION_DEPARTURE_SLIP') ||
    capabilities.has('EXECUTION_SCHEDULE_INFEASIBLE')
  ) {
    return 'QUEUE';
  }

  if (
    capabilities.has('WEATHER_ACTIVITY_PROHIBITED') ||
    capabilities.has('WEATHER_STRONG_WIND') ||
    capabilities.has('DRIVING_SPEED_REDUCED')
  ) {
    return 'LOG_ONLY';
  }

  return 'SILENT';
}

export function escalateAttentionLevel(
  current: AttentionLevel,
  proposed: AttentionLevel,
): { level: AttentionLevel; escalated: boolean } {
  if (ATTENTION_LEVEL_ORDER[proposed] > ATTENTION_LEVEL_ORDER[current]) {
    return { level: proposed, escalated: true };
  }
  return { level: current, escalated: false };
}

export function shouldNotifyForAttentionChange(input: {
  previousLevel: AttentionLevel;
  nextLevel: AttentionLevel;
  status: RootCauseClusterStatus;
  acknowledgedAt?: string;
}): boolean {
  if (input.status === 'ACKNOWLEDGED' || input.status === 'RESOLVED') {
    return false;
  }
  if (input.acknowledgedAt) return false;
  return ATTENTION_LEVEL_ORDER[input.nextLevel] > ATTENTION_LEVEL_ORDER[input.previousLevel];
}

export function isQueueVisible(level: AttentionLevel): boolean {
  return ATTENTION_LEVEL_ORDER[level] >= ATTENTION_LEVEL_ORDER.QUEUE;
}
