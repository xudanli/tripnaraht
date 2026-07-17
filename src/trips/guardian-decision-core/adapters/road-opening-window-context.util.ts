/**
 * Resolve hard opening windows for road-repair candidates (sync, no I/O).
 */

import type { RoutePlanDraft } from '../../decision/shared/world-model.types';
import type { Rfc001RepairCandidate } from '../contracts/guardian-outputs.types';
import { ORIGINAL_CANDIDATE_ID } from './repair-candidate.adapter';
import {
  readActivityContextFromTripMetadata,
  readMetadataWindow,
} from '../utils/execution-activity-context.util';
import type { RoadCandidateOpeningWindow } from '../assessment/road-candidate-opening-window.assessor';
import { isTripInExecutionPhase } from '../../../decision-runtime/gateway/utils/plan-object-execution-admission.util';
import { readSegmentItineraryItemId } from '../detection/segment-plan-item.util';

/**
 * Optional pack fixtures for substitute POI keys that have hard entry windows.
 * Natural / all-day POIs must NOT appear here — absence means skip (PASS).
 */
export const ROAD_CANDIDATE_POI_WINDOW_FIXTURE: Record<
  string,
  RoadCandidateOpeningWindow
> = {
  // Shared with execution-slip substitute; museum / timed indoor-style fallbacks
  poi_nearby_substitute: {
    lastEntryAt: '18:00',
    closesAt: '20:00',
    timezone: 'Atlantic/Reykjavik',
  },
};

const TRIP_POI_WINDOWS_KEY = 'rfc001PoiOpeningWindows';

export interface RoadOpeningWindowEvaluationContext {
  referenceArrivalIso: string;
  /** activityId / itineraryItemId → window */
  windowsByActivityId: Record<string, RoadCandidateOpeningWindow>;
  /** poiKey / substitutePoiId → window */
  windowsByPoiId: Record<string, RoadCandidateOpeningWindow>;
}

export function buildRoadOpeningWindowEvaluationContext(input: {
  tripMetadata?: unknown;
  tripStatus?: string | null;
  basePlan: RoutePlanDraft;
  affectedPlanItemIds: string[];
  now?: Date;
  /** Extra windows (e.g. from Place.metadata) keyed by activity or poi */
  extraWindowsByActivityId?: Record<string, RoadCandidateOpeningWindow>;
  extraWindowsByPoiId?: Record<string, RoadCandidateOpeningWindow>;
}): RoadOpeningWindowEvaluationContext {
  const tripMeta = (input.tripMetadata ?? {}) as Record<string, unknown>;
  const windowsByActivityId: Record<string, RoadCandidateOpeningWindow> = {
    ...(input.extraWindowsByActivityId ?? {}),
  };
  const windowsByPoiId: Record<string, RoadCandidateOpeningWindow> = {
    ...ROAD_CANDIDATE_POI_WINDOW_FIXTURE,
    ...readTripPoiWindows(tripMeta),
    ...(input.extraWindowsByPoiId ?? {}),
  };

  let plannedArrivalFromActivity: string | undefined;
  let observedAt: string | undefined;
  let dayDate: string | undefined;

  for (const activityId of input.affectedPlanItemIds) {
    const ctx = readActivityContextFromTripMetadata(tripMeta, activityId);
    const win = ctx.executionWindow
      ? normalizeWindow(ctx.executionWindow)
      : null;
    if (win) windowsByActivityId[activityId] = win;
    if (ctx.plannedArrivalAt) {
      plannedArrivalFromActivity = ctx.plannedArrivalAt;
    } else if (ctx.plannedDepartAt && !plannedArrivalFromActivity) {
      plannedArrivalFromActivity = ctx.plannedDepartAt;
    }
    if (ctx.observedAt) observedAt = ctx.observedAt;

    const seg = (input.basePlan.segments ?? []).find(
      (s) => readSegmentItineraryItemId(s) === activityId,
    );
    const meta = (seg?.metadata ?? {}) as Record<string, unknown>;
    if (typeof meta.date === 'string') dayDate = meta.date;
    const segWin = readMetadataWindow(meta);
    if (segWin?.lastEntryAt) {
      windowsByActivityId[activityId] = {
        lastEntryAt: segWin.lastEntryAt,
        closesAt: segWin.closesAt,
        timezone: segWin.timezone ?? 'UTC',
      };
    }
    if (typeof meta.poiId === 'string' || typeof meta.poiKey === 'string') {
      const poiKey = String(meta.poiId ?? meta.poiKey);
      const placeWin = readMetadataWindow(meta);
      if (placeWin?.lastEntryAt) {
        windowsByPoiId[poiKey] = {
          lastEntryAt: placeWin.lastEntryAt,
          closesAt: placeWin.closesAt,
          timezone: placeWin.timezone ?? 'UTC',
        };
      }
    }
  }

  const now = input.now ?? new Date();
  const referenceArrivalIso = resolveReferenceArrivalIso({
    observedAt,
    plannedArrivalIso: plannedArrivalFromActivity,
    tripStatus: input.tripStatus,
    dayDateIso: dayDate,
    now,
  });

  return { referenceArrivalIso, windowsByActivityId, windowsByPoiId };
}

export function resolveRoadCandidateTargetWindow(input: {
  candidateId: string;
  candidate?: Rfc001RepairCandidate;
  affectedPlanItemIds: string[];
  context: RoadOpeningWindowEvaluationContext;
}): RoadCandidateOpeningWindow | null {
  const { candidateId, candidate, affectedPlanItemIds, context } = input;

  if (candidateId !== ORIGINAL_CANDIDATE_ID && candidate) {
    const substitutePoiId = readSubstitutePoiId(candidate);
    if (substitutePoiId) {
      const byPoi = context.windowsByPoiId[substitutePoiId];
      if (byPoi) return byPoi;
    }
  }

  for (const activityId of affectedPlanItemIds) {
    const byActivity = context.windowsByActivityId[activityId];
    if (byActivity) return byActivity;
  }

  return null;
}

export function resolveReferenceArrivalIso(input: {
  observedAt?: string;
  plannedArrivalIso?: string;
  tripStatus?: string | null;
  dayDateIso?: string;
  now?: Date;
}): string {
  if (input.observedAt) return input.observedAt;
  if (isTripInExecutionPhase(input.tripStatus)) {
    return (input.now ?? new Date()).toISOString();
  }
  if (input.plannedArrivalIso) return input.plannedArrivalIso;
  if (input.dayDateIso) {
    return `${input.dayDateIso}T12:00:00.000Z`;
  }
  return (input.now ?? new Date()).toISOString();
}

function readSubstitutePoiId(candidate: Rfc001RepairCandidate): string | undefined {
  for (const op of candidate.proposedOperations ?? []) {
    if (op.kind === 'REPLACE_ITEM' && op.parameters?.substitutePoiId) {
      return String(op.parameters.substitutePoiId);
    }
  }
  return undefined;
}

function readTripPoiWindows(
  tripMeta: Record<string, unknown>,
): Record<string, RoadCandidateOpeningWindow> {
  const raw = tripMeta[TRIP_POI_WINDOWS_KEY];
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, RoadCandidateOpeningWindow> = {};
  for (const [poiId, value] of Object.entries(raw as Record<string, unknown>)) {
    const win = normalizeWindow(value as { lastEntryAt?: string; closesAt?: string; timezone?: string });
    if (win) out[poiId] = win;
  }
  return out;
}

function normalizeWindow(
  value: { lastEntryAt?: string; closesAt?: string; timezone?: string } | null | undefined,
): RoadCandidateOpeningWindow | null {
  if (!value?.lastEntryAt) return null;
  return {
    lastEntryAt: value.lastEntryAt,
    closesAt: value.closesAt,
    timezone: value.timezone ?? 'UTC',
  };
}
