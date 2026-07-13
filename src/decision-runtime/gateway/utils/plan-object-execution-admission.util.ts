/**
 * Planning-layer assessments (Plan Object, schedule feasibility) — exclude from execution (TRAVELING).
 */

import { isPlanObjectSemanticKey } from '../../constraints/utils/plan-object-repair-options.util';

export function isTripInExecutionPhase(status?: string | null): boolean {
  const normalized = status?.trim().toUpperCase();
  return normalized === 'TRAVELING' || normalized === 'IN_PROGRESS';
}

export function isPlanObjectDecisionProblem(input: {
  problemId?: string;
  semanticKey?: string;
}): boolean {
  if (isPlanObjectSemanticKey(input.semanticKey)) return true;
  if (input.problemId && isPlanObjectSemanticKey(input.problemId)) return true;
  return false;
}

/** Feasibility schedule diagnosis — same_day_travel, buffer, fatigue, etc. */
export function isScheduleFeasibilityDecisionProblem(input: {
  problemId?: string;
  semanticKey?: string;
}): boolean {
  const blob = `${input.problemId ?? ''} ${input.semanticKey ?? ''}`.toLowerCase();
  return (
    blob.includes('same_day_travel') ||
    blob.includes('inter_day_travel') ||
    blob.includes('buffer_insufficient') ||
    blob.includes('transfer_buffer') ||
    blob.includes('daily_fatigue') ||
    blob.includes('dp_travel:')
  );
}

/** Plan Object + schedule feasibility — planning-only, not in-trip execution. */
export function isPlanningLayerDecisionProblem(input: {
  problemId?: string;
  semanticKey?: string;
}): boolean {
  return (
    isPlanObjectDecisionProblem(input) || isScheduleFeasibilityDecisionProblem(input)
  );
}

export function shouldExcludePlanObjectFromExecutionQueue(input: {
  problemId?: string;
  semanticKey?: string;
  tripStatus?: string | null;
}): boolean {
  return (
    isTripInExecutionPhase(input.tripStatus) && isPlanningLayerDecisionProblem(input)
  );
}
