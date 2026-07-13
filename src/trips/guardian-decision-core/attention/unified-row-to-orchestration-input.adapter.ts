/**
 * Maps Unified Read Model rows → Attention Orchestration inputs (read-only adapter).
 */

import type { InternalUnifiedProblemRow } from '../../../decision-runtime/gateway/utils/unified-decision-problem-projection.util';
import { qualifiesForDecisionQueue } from '../../../decision-runtime/gateway/utils/decision-queue-admission.util';
import type { UnifiedDecisionProblemListItem } from '../../../decision-runtime/gateway/contracts/unified-decision-ui.types';
import type {
  AttentionOrchestrationProblemInput,
} from '../contracts/attention-orchestration.types';
import type { Rfc001DecisionProblemStatus, Rfc001DecisionProblemUrgency } from '../contracts/decision-problem.types';

/** First-round Slice 4 Shadow ingest (wind chain). */
export const SLICE4_SHADOW_INGEST_CAPABILITIES = new Set([
  'WEATHER_STRONG_WIND',
  'WEATHER_ACTIVITY_PROHIBITED',
  'EXECUTION_SCHEDULE_INFEASIBLE',
  'EXECUTION_DEPARTURE_SLIP',
  'ACTIVITY_WINDOW_MISSED',
  'NIGHT_DRIVING_RISK',
]);

/** Read for separation checks; not ingested into wind cluster runtime. */
export const SLICE4_SHADOW_OBSERVE_ONLY_CAPABILITIES = new Set([
  'ROAD_SEGMENT_UNAVAILABLE',
  'ROAD_CLOSED',
  'ROAD_SEGMENT_RESTRICTED',
]);

const WORKFLOW_TO_RFC001_STATUS: Record<string, Rfc001DecisionProblemStatus> = {
  OPEN: 'OPEN',
  EVALUATING: 'EVALUATING',
  WAITING_DECISION: 'WAITING_HUMAN',
  WAITING_HUMAN: 'WAITING_HUMAN',
  DECIDED: 'DECIDED',
  APPLYING: 'EXECUTING',
  DRAFT_CREATED: 'EXECUTING',
  RESOLVED: 'RESOLVED',
  DISMISSED: 'RESOLVED',
  FAILED: 'FAILED',
};

export function normalizeShadowSemanticCapability(semanticKey: string): string {
  if (semanticKey === 'WEATHER_ACTIVITY_PROHIBITED') {
    return 'WEATHER_STRONG_WIND';
  }
  return semanticKey;
}

export function isSlice4ShadowIngestCapability(semanticKey: string): boolean {
  return SLICE4_SHADOW_INGEST_CAPABILITIES.has(semanticKey);
}

export function isSlice4ShadowObserveOnlyCapability(semanticKey: string): boolean {
  return SLICE4_SHADOW_OBSERVE_ONLY_CAPABILITIES.has(semanticKey);
}

export function mapUnifiedRowToOrchestrationInput(
  row: InternalUnifiedProblemRow,
): AttentionOrchestrationProblemInput | null {
  if (!isSlice4ShadowIngestCapability(row.semanticKey)) {
    return null;
  }

  const semanticCapability = normalizeShadowSemanticCapability(row.semanticKey);
  const detectedAt =
    row.occurrences[0]?.observedAt ??
    row.rawCanonical?.problemSummary.detectedAt ??
    (row.rawLegacy && 'detectedAt' in row.rawLegacy ? row.rawLegacy.detectedAt : undefined) ??
    new Date().toISOString();

  const routeSegmentId =
    row.scope.routeSegmentIds?.[0] ??
    row.rawCanonical?.rfc001Problem.affectedEntityRefs?.find((r) => r.kind === 'ROUTE_SEGMENT')
      ?.id;

  const weatherEpisodeId = extractWeatherEpisodeId(row);
  const causedByProblemId = extractCausedByProblemId(row);

  return {
    problemId: row.problemId,
    tripId: row.scope.tripId ?? row.rawCanonical?.tripId ?? '',
    semanticCapability,
    status: WORKFLOW_TO_RFC001_STATUS[row.workflowStatus] ?? 'OPEN',
    detectedAt,
    urgency: mapUrgency(row),
    routeSegmentId,
    weatherEpisodeId,
    causedByProblemId,
    headline: row.queueTitle ?? row.title,
    explanation: row.queueDescription ?? row.summary,
    rootCauseCode:
      semanticCapability === 'WEATHER_STRONG_WIND' ? 'WEATHER_STRONG_WIND' : undefined,
  };
}

export function filterRowsForSlice4ShadowIngest(
  rows: InternalUnifiedProblemRow[],
): InternalUnifiedProblemRow[] {
  return rows.filter((row) => isSlice4ShadowIngestCapability(row.semanticKey));
}

export function projectLegacyVisibleQueueItems(
  rows: InternalUnifiedProblemRow[],
): Array<{
  problemId: string;
  semanticKey: string;
  title: string;
  workflowStatus: string;
}> {
  return rows
    .filter((row) => {
      if (['RESOLVED', 'DISMISSED'].includes(row.workflowStatus)) return false;
      return qualifiesForDecisionQueue({
        enforcement: row.enforcement,
        workflowStatus: row.workflowStatus,
        semanticKey: row.semanticKey,
        title: row.title,
        summary: row.summary,
        hasExecutableOptions: row.hasExecutableOptions,
        blocksPlan: row.enforcement === 'BLOCK',
        requiresAdjustment: row.enforcement === 'REQUIRE_ADJUSTMENT',
        requiresConfirmation: row.enforcement === 'REQUIRE_CONFIRMATION',
      });
    })
    .map((row) => ({
      problemId: row.problemId,
      semanticKey: row.semanticKey,
      title: row.queueTitle ?? row.title,
      workflowStatus: row.workflowStatus,
    }));
}

export function projectLegacyVisibleFromListItems(
  items: UnifiedDecisionProblemListItem[],
): Array<{
  problemId: string;
  semanticKey: string;
  title: string;
  workflowStatus: string;
}> {
  return items
    .filter(
      (item) =>
        !['RESOLVED', 'DISMISSED'].includes(item.workflowStatus) &&
        item.actionability.requiresAction,
    )
    .map((item) => ({
      problemId: item.problemId,
      semanticKey: item.semanticKey,
      title: item.title,
      workflowStatus: item.workflowStatus,
    }));
}

function extractWeatherEpisodeId(row: InternalUnifiedProblemRow): string | undefined {
  const fromProblem = (row.rawCanonical?.rfc001Problem as { weatherEpisodeId?: string } | undefined)
    ?.weatherEpisodeId;
  if (fromProblem) return fromProblem;

  const triggerEventId = row.rawCanonical?.rfc001Problem.triggerEventId;
  if (triggerEventId) {
    const prefixed = triggerEventId.match(/^weather_episode:(.+)$/);
    if (prefixed?.[1]) return prefixed[1];
    const m = triggerEventId.match(/(?:weather_ep|episode)[_:]([a-zA-Z0-9_.-]+)/i);
    if (m?.[1]) return m[1];
  }
  return undefined;
}

function extractCausedByProblemId(row: InternalUnifiedProblemRow): string | undefined {
  const fromProblem = (row.rawCanonical?.rfc001Problem as { causedByProblemId?: string } | undefined)
    ?.causedByProblemId;
  return fromProblem?.trim() || undefined;
}

function mapUrgency(row: InternalUnifiedProblemRow): Rfc001DecisionProblemUrgency | undefined {
  const urgency = row.rawCanonical?.rfc001Problem.urgency;
  if (urgency) return urgency;
  if (row.enforcement === 'BLOCK') return 'CRITICAL';
  if (row.enforcement === 'REQUIRE_ADJUSTMENT') return 'HIGH';
  return undefined;
}

export function buildShadowOrchestrationContext(
  tripId: string,
  problems: AttentionOrchestrationProblemInput[],
  overrides?: Partial<{
    routeSegmentId: string;
    weatherEpisodeId: string;
    now: string;
  }>,
): {
  tripId: string;
  routeSegmentId: string;
  weatherEpisodeId: string;
  now?: string;
} {
  return {
    tripId,
    routeSegmentId:
      overrides?.routeSegmentId ??
      problems.find((p) => p.routeSegmentId)?.routeSegmentId ??
      `segment:${tripId}:shadow_default`,
    weatherEpisodeId:
      overrides?.weatherEpisodeId ??
      problems.find((p) => p.weatherEpisodeId)?.weatherEpisodeId ??
      `episode:${tripId}:shadow_default`,
    now: overrides?.now,
  };
}
