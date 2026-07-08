import { EXPLORATION_ROUTE_VARIANT_STATUS } from '../constants/exploration-status.constants';
import type { ContextHistory } from '../../../travel-context/domain/travel-context.types';

export type ExplorationArchive = NonNullable<ContextHistory['explorationArchive']>;

export interface RouteVariantArchiveInput {
  routeId: string;
  status: string;
}

/** Build RFC-003 §12 explorationArchive from route variant rows. */
export function buildExplorationArchive(input: {
  variants: RouteVariantArchiveInput[];
  researchProtocolId?: string | null;
  materializedAt?: string;
  principles?: string[];
}): ExplorationArchive {
  const selected = input.variants.find(
    (v) => v.status === EXPLORATION_ROUTE_VARIANT_STATUS.SELECTED,
  );
  const rejectedRouteIds = input.variants
    .filter((v) => v.status === EXPLORATION_ROUTE_VARIANT_STATUS.ARCHIVED)
    .map((v) => v.routeId);

  return {
    rejectedRouteIds,
    selectedRouteId: selected?.routeId ?? null,
    researchProtocolId: input.researchProtocolId ?? null,
    materializedAt: input.materializedAt,
    ...(input.principles?.length ? { principles: input.principles } : {}),
  };
}

export function readExplorationArchiveFromTripMetadata(
  metadata: Record<string, unknown> | null | undefined,
): ExplorationArchive | undefined {
  if (!metadata) return undefined;

  const travelContext = metadata.travelContext as Record<string, unknown> | undefined;
  const nested = travelContext?.explorationArchive;
  if (nested && typeof nested === 'object') {
    return normalizeExplorationArchive(nested as Record<string, unknown>);
  }

  return undefined;
}

export function readRankedPrinciplesFromTripMetadata(
  metadata: Record<string, unknown> | null | undefined,
): string[] | undefined {
  if (!metadata) return undefined;
  const contract = metadata.travelDecisionContract as Record<string, unknown> | undefined;
  const objectives = contract?.objectives as Record<string, unknown> | undefined;
  const ranked = objectives?.rankedPrinciples;
  if (Array.isArray(ranked) && ranked.every((item) => typeof item === 'string')) {
    return ranked as string[];
  }
  return undefined;
}

export function mergeTravelContextExplorationArchive(
  metadata: Record<string, unknown>,
  input: { contextId: string; explorationArchive: ExplorationArchive },
): Record<string, unknown> {
  const existingTravelContext =
    typeof metadata.travelContext === 'object' && metadata.travelContext !== null
      ? (metadata.travelContext as Record<string, unknown>)
      : {};

  return {
    ...metadata,
    travelContextId: input.contextId,
    travelContext: {
      ...existingTravelContext,
      contextId: input.contextId,
      explorationArchive: input.explorationArchive,
    },
  };
}

function normalizeExplorationArchive(raw: Record<string, unknown>): ExplorationArchive {
  return {
    rejectedRouteIds: Array.isArray(raw.rejectedRouteIds)
      ? raw.rejectedRouteIds.filter((id): id is string => typeof id === 'string')
      : [],
    selectedRouteId:
      typeof raw.selectedRouteId === 'string'
        ? raw.selectedRouteId
        : raw.selectedRouteId === null
          ? null
          : undefined,
    researchProtocolId:
      typeof raw.researchProtocolId === 'string' ? raw.researchProtocolId : null,
    materializedAt:
      typeof raw.materializedAt === 'string' ? raw.materializedAt : undefined,
    principles: Array.isArray(raw.principles)
      ? raw.principles.filter((p): p is string => typeof p === 'string')
      : undefined,
  };
}
