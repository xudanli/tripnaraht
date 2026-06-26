import { buildTravelEventEnvelope } from '../../event-store/travel-event-envelope.builder';
import { eventIdFromIdempotencyKey } from '../../event-store/travel-event-idempotency.util';
import {
  TravelEventSource,
  TravelEventType,
  TrajectorySegment,
  type TravelEventEnvelope,
} from '../../event-store/types/travel-event.types';
import type {
  NarrativeIntakeInput,
  TripNarrativeThemeMetadata,
} from '../types/travel-storyform.types';
import type { NarrativeArcTemplate } from '../types/narrative-arc.types';

export interface NarrativeThemeSelectedPayload {
  themeId: string;
  title: string;
  arcTemplate: NarrativeArcTemplate;
  generationRequestId: string;
  regenerateCount: number;
  intakeSnapshot?: NarrativeIntakeInput;
}

export function buildNarrativeThemeSelectedIdempotencyKey(input: {
  tripId: string;
  themeId: string;
  generationRequestId: string;
}): string {
  return [
    'narrative:theme_selected',
    input.tripId,
    input.themeId,
    input.generationRequestId,
  ].join('|');
}

export function buildNarrativeThemeSelectedEnvelope(input: {
  tripId: string;
  theme: TripNarrativeThemeMetadata;
  userId?: string;
  requestId?: string;
}): TravelEventEnvelope {
  const payload: NarrativeThemeSelectedPayload = {
    themeId: input.theme.selectedThemeId,
    title: input.theme.title,
    arcTemplate: input.theme.arcTemplate,
    generationRequestId: input.theme.generationRequestId ?? '',
    regenerateCount: input.theme.regenerateCount,
    intakeSnapshot: input.theme.intakeSnapshot,
  };

  const idempotencyKey = buildNarrativeThemeSelectedIdempotencyKey({
    tripId: input.tripId,
    themeId: input.theme.selectedThemeId,
    generationRequestId: input.theme.generationRequestId ?? '',
  });

  return buildTravelEventEnvelope({
    tripId: input.tripId,
    segment: TrajectorySegment.DECISION,
    eventType: TravelEventType.TRIP_NARRATIVE_THEME_SELECTED,
    source: TravelEventSource.NARRATIVE_ENGINE,
    payload: payload as unknown as Record<string, unknown>,
    userId: input.userId,
    requestId: input.requestId,
    idempotencyKey,
  });
}

export function buildNarrativeThemeClearedIdempotencyKey(input: {
  tripId: string;
  clearedAt: string;
}): string {
  return ['narrative:theme_cleared', input.tripId, input.clearedAt].join('|');
}

export function buildNarrativeThemeClearedEnvelope(input: {
  tripId: string;
  userId?: string;
  requestId?: string;
  timestamp?: string;
}): TravelEventEnvelope {
  const timestamp = input.timestamp ?? new Date().toISOString();
  const idempotencyKey = buildNarrativeThemeClearedIdempotencyKey({
    tripId: input.tripId,
    clearedAt: timestamp,
  });

  return buildTravelEventEnvelope({
    tripId: input.tripId,
    segment: TrajectorySegment.DECISION,
    eventType: TravelEventType.TRIP_NARRATIVE_THEME_CLEARED,
    source: TravelEventSource.NARRATIVE_ENGINE,
    payload: { clearedAt: timestamp },
    userId: input.userId,
    requestId: input.requestId,
    timestamp,
    idempotencyKey,
  });
}

/** @internal test helper */
export function narrativeThemeEventId(idempotencyKey: string): string {
  return eventIdFromIdempotencyKey(idempotencyKey);
}
