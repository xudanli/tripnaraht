/**
 * Primary Problem selection — decision priority, not earliest-created.
 * Root cause explains; decision-driving capability drives confirmation entry.
 */

import type { AttentionOrchestrationProblemInput } from '../contracts/attention-orchestration.types';

const TERMINAL_STATUSES = new Set(['RESOLVED', 'FAILED']);

const DECISION_DRIVING_CAPABILITIES = new Set([
  'EXECUTION_SCHEDULE_INFEASIBLE',
  'ACTIVITY_WINDOW_MISSED',
  'ROAD_SEGMENT_UNAVAILABLE',
  'ROAD_CLOSED',
]);

const ROOT_CAUSE_CAPABILITIES = new Set([
  'WEATHER_STRONG_WIND',
  'WEATHER_ACTIVITY_PROHIBITED',
  'ROAD_SEGMENT_UNAVAILABLE',
  'ROAD_CLOSED',
]);

/** Lower rank = higher priority among decision-driving problems. */
const DECISION_DRIVING_RANK: Record<string, number> = {
  ROAD_CLOSED: 1,
  ROAD_SEGMENT_UNAVAILABLE: 1,
  EXECUTION_SCHEDULE_INFEASIBLE: 2,
  ACTIVITY_WINDOW_MISSED: 3,
};

function isDecisionDriving(problem: AttentionOrchestrationProblemInput): boolean {
  return DECISION_DRIVING_CAPABILITIES.has(problem.semanticCapability);
}

function isRootCause(problem: AttentionOrchestrationProblemInput): boolean {
  return ROOT_CAUSE_CAPABILITIES.has(problem.semanticCapability);
}

function compareDetectedAt(
  a: AttentionOrchestrationProblemInput,
  b: AttentionOrchestrationProblemInput,
): number {
  return a.detectedAt.localeCompare(b.detectedAt);
}

export function selectPrimaryProblemId(
  problems: AttentionOrchestrationProblemInput[],
): string | undefined {
  const open = problems.filter((p) => !TERMINAL_STATUSES.has(p.status));
  const pool = open.length > 0 ? open : problems;
  if (pool.length === 0) return undefined;

  const decisionDriving = pool.filter(isDecisionDriving);
  if (decisionDriving.length > 0) {
    const sorted = [...decisionDriving].sort((a, b) => {
      const rankDiff =
        (DECISION_DRIVING_RANK[a.semanticCapability] ?? 99) -
        (DECISION_DRIVING_RANK[b.semanticCapability] ?? 99);
      if (rankDiff !== 0) return rankDiff;
      return compareDetectedAt(a, b);
    });
    return sorted[0]?.problemId;
  }

  const roots = pool.filter(isRootCause);
  if (roots.length > 0) {
    return [...roots].sort(compareDetectedAt)[0]?.problemId;
  }

  return [...pool].sort(compareDetectedAt)[0]?.problemId;
}

export function selectPrimaryProblem(
  problems: AttentionOrchestrationProblemInput[],
): AttentionOrchestrationProblemInput | undefined {
  const id = selectPrimaryProblemId(problems);
  if (!id) return undefined;
  return problems.find((p) => p.problemId === id);
}
