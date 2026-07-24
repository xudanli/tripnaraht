import type { TravelContextStage } from './travel-context.constants';
import type { TravelContextIdentity } from './travel-context.types';

/** V1: contextId === scenarioId for exploration-created contexts */
export function explorationContextId(scenarioId: string): string {
  return scenarioId;
}

/** Canonical context id — prefers explicit contextId column when present. */
export function resolveCanonicalContextId(input: {
  id: string;
  contextId?: string | null;
}): string {
  const explicit = input.contextId?.trim();
  return explicit || input.id;
}

export function assertContextIdInvariant(input: {
  contextId: string;
  scenarioId?: string | null;
}): boolean {
  if (!input.scenarioId) return true;
  return input.contextId === input.scenarioId || input.contextId.length > 0;
}

export function readTravelContextIdFromTripMetadata(
  metadata: Record<string, unknown> | null | undefined,
): string | undefined {
  if (!metadata) return undefined;
  const direct = metadata.travelContextId;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  const nested = metadata.travelContext as Record<string, unknown> | undefined;
  const nestedId = nested?.contextId;
  if (typeof nestedId === 'string' && nestedId.trim()) return nestedId.trim();
  const scenarioId = metadata.explorationScenarioId;
  if (typeof scenarioId === 'string' && scenarioId.trim()) return scenarioId.trim();
  return undefined;
}

export function mapExplorationStatusToStage(input: {
  scenarioStatus: string;
  tripId?: string | null;
  tripStatus?: string | null;
  candidatesSelected?: boolean;
}): TravelContextStage {
  const { scenarioStatus, tripId, tripStatus, candidatesSelected } = input;

  if (scenarioStatus === 'ABANDONED') return 'COMPLETED';
  if (scenarioStatus === 'COMPLETED') return 'COMPLETED';

  if (tripId) {
    const ts = String(tripStatus ?? '').toUpperCase();
    if (ts === 'TRAVELING' || ts === 'IN_PROGRESS') return 'TRAVELING';
    if (ts === 'COMPLETED') return 'COMPLETED';
    if (ts === 'READY') return 'READY';
    return 'PLANNING';
  }

  if (candidatesSelected) return 'SCENARIO_SELECTED';
  if (scenarioStatus === 'MATERIALIZED' || scenarioStatus === 'MATERIALIZING') {
    return 'TRIP_MATERIALIZED';
  }

  return 'EXPLORATION';
}

export function buildTravelContextIdentity(input: {
  contextId: string;
  ownerUserId: string;
  createdAt: string;
  stage: TravelContextStage;
  scenarioId?: string;
  tripId?: string;
  conversationId?: string;
}): TravelContextIdentity {
  return {
    contextId: input.contextId,
    stage: input.stage,
    ownerUserId: input.ownerUserId,
    createdAt: input.createdAt,
    scenarioId: input.scenarioId ?? input.contextId,
    tripId: input.tripId,
    conversationId: input.conversationId,
  };
}
