import type { Prisma } from '@prisma/client';
import type { WishCategory } from '../../wishlist/types/trip-wish.types';
import type {
  DecisionProblemNegotiationBinding,
  TripDecisionNegotiationMetadata,
} from '../types/decision-problem-negotiation.types';

const METADATA_KEY = 'decisionProblemNegotiations';

export function negotiationTaskIdForProblem(problemId: string): string {
  return `nt:${problemId}`;
}

export function readNegotiationMetadata(
  metadata: Prisma.JsonValue | null | undefined,
): TripDecisionNegotiationMetadata {
  const root = (metadata ?? {}) as Record<string, unknown>;
  const raw = root[METADATA_KEY] as TripDecisionNegotiationMetadata | undefined;
  return {
    byProblemId: { ...(raw?.byProblemId ?? {}) },
  };
}

export function writeNegotiationBinding(
  metadata: Prisma.JsonValue | null | undefined,
  problemId: string,
  binding: DecisionProblemNegotiationBinding,
): Prisma.InputJsonValue {
  const current = readNegotiationMetadata(metadata);
  return mergeNegotiationMetadata(metadata, {
    byProblemId: {
      ...current.byProblemId,
      [problemId]: binding,
    },
  });
}

export function writeNegotiationOutcome(
  metadata: Prisma.JsonValue | null | undefined,
  problemId: string,
  outcome: DecisionProblemNegotiationBinding['outcome'],
): Prisma.InputJsonValue {
  const current = readNegotiationMetadata(metadata);
  const existing = current.byProblemId[problemId];
  if (!existing) {
    return metadata as Prisma.InputJsonValue;
  }
  return mergeNegotiationMetadata(metadata, {
    byProblemId: {
      ...current.byProblemId,
      [problemId]: { ...existing, outcome },
    },
  });
}

function mergeNegotiationMetadata(
  metadata: Prisma.JsonValue | null | undefined,
  store: TripDecisionNegotiationMetadata,
): Prisma.InputJsonValue {
  return {
    ...((metadata as Record<string, unknown> | null) ?? {}),
    [METADATA_KEY]: store,
  } as unknown as Prisma.InputJsonValue;
}

export function findProblemIdForRound(
  metadata: Prisma.JsonValue | null | undefined,
  roundId: string,
): string | null {
  const store = readNegotiationMetadata(metadata);
  for (const [problemId, binding] of Object.entries(store.byProblemId)) {
    if (binding.roundId === roundId) {
      return problemId;
    }
  }
  return null;
}

export function getBindingForProblem(
  metadata: Prisma.JsonValue | null | undefined,
  problemId: string,
): DecisionProblemNegotiationBinding | null {
  return readNegotiationMetadata(metadata).byProblemId[problemId] ?? null;
}

export function isActiveRoundBinding(
  binding: DecisionProblemNegotiationBinding | null,
  activeRoundId: string | null,
): boolean {
  return Boolean(binding && activeRoundId && binding.roundId === activeRoundId);
}

export function summarizeDomainFromBinding(
  binding: DecisionProblemNegotiationBinding | null,
): WishCategory | null {
  return binding?.domain ?? null;
}
