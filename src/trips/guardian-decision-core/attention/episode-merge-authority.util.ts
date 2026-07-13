/**
 * Episode merge authority — prefer MISSED_MERGE over FALSE_MERGE.
 *
 * Rules (frozen):
 * - Explicit weatherEpisodeId on problem → may participate in cross-module merge
 * - causal lineage (causedByProblemId) → may inherit episode / merge
 * - Neither → default DO NOT merge into wind cluster
 */

import type { AttentionOrchestrationProblemInput } from '../contracts/attention-orchestration.types';
import { normalizeShadowSemanticCapability } from './unified-row-to-orchestration-input.adapter';

export function isWeatherRootCapability(semanticCapability: string): boolean {
  const cap = normalizeShadowSemanticCapability(semanticCapability);
  return cap === 'WEATHER_STRONG_WIND';
}

export function problemHasExplicitEpisode(
  problem: AttentionOrchestrationProblemInput,
): boolean {
  return Boolean(problem.weatherEpisodeId);
}

export function problemHasCausalLineage(
  problem: AttentionOrchestrationProblemInput,
): boolean {
  return Boolean(problem.causedByProblemId);
}

export function problemHasMergeAuthority(
  problem: AttentionOrchestrationProblemInput,
): boolean {
  if (problem.rootCauseKey) return true;
  if (isWeatherRootCapability(problem.semanticCapability)) return true;
  return problemHasExplicitEpisode(problem) || problemHasCausalLineage(problem);
}

/**
 * Resolve weather episode for rootCauseKey.
 * Context episode applies ONLY to weather root problems (run-level explicit scope).
 */
export function resolveWeatherEpisodeId(input: {
  problem: AttentionOrchestrationProblemInput;
  contextEpisodeId?: string;
  parentEpisodeId?: string;
}): string | undefined {
  if (input.problem.weatherEpisodeId) return input.problem.weatherEpisodeId;
  if (input.parentEpisodeId) return input.parentEpisodeId;
  if (isWeatherRootCapability(input.problem.semanticCapability)) {
    return input.contextEpisodeId;
  }
  return undefined;
}
