/**
 * Persist DecisionCases + OpportunityCandidates on trip.metadata.decisionCases
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { toInputJsonValue } from '../../../trips/budget-os/utils/prisma-json.util';
import {
  DECISION_CASE_METADATA_KEY,
  type DecisionCaseStoreState,
  type DecisionOpportunityCandidate,
  type StoredDecisionCase,
} from '../contracts/decision-case.types';

export function readDecisionCaseStoreFromMetadata(
  metadata: unknown,
): DecisionCaseStoreState {
  const root = (metadata ?? {}) as Record<string, unknown>;
  const raw = root[DECISION_CASE_METADATA_KEY] as DecisionCaseStoreState | undefined;
  return {
    byProblemId: { ...(raw?.byProblemId ?? {}) },
    opportunitiesById: { ...(raw?.opportunitiesById ?? {}) },
  };
}

@Injectable()
export class DecisionCaseStoreService {
  constructor(private readonly prisma: PrismaService) {}

  read(metadata: unknown): DecisionCaseStoreState {
    return readDecisionCaseStoreFromMetadata(metadata);
  }

  async load(tripId: string): Promise<DecisionCaseStoreState> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    return this.read(trip?.metadata);
  }

  async listPublished(tripId: string): Promise<StoredDecisionCase[]> {
    const state = await this.load(tripId);
    return Object.values(state.byProblemId).filter((c) => c.published);
  }

  async getCase(
    tripId: string,
    problemId: string,
  ): Promise<StoredDecisionCase | undefined> {
    const state = await this.load(tripId);
    return state.byProblemId[problemId];
  }

  async listOpportunities(tripId: string): Promise<DecisionOpportunityCandidate[]> {
    const state = await this.load(tripId);
    return Object.values(state.opportunitiesById).sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
  }

  async upsertCase(tripId: string, decisionCase: StoredDecisionCase): Promise<StoredDecisionCase> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    const meta = (trip?.metadata ?? {}) as Record<string, unknown>;
    const state = this.read(meta);
    state.byProblemId[decisionCase.problemId] = decisionCase;
    await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        metadata: toInputJsonValue({
          ...meta,
          [DECISION_CASE_METADATA_KEY]: state,
        }),
      },
    });
    return decisionCase;
  }

  async upsertOpportunity(
    tripId: string,
    opportunity: DecisionOpportunityCandidate,
  ): Promise<DecisionOpportunityCandidate> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    const meta = (trip?.metadata ?? {}) as Record<string, unknown>;
    const state = this.read(meta);
    state.opportunitiesById[opportunity.opportunityId] = opportunity;
    await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        metadata: toInputJsonValue({
          ...meta,
          [DECISION_CASE_METADATA_KEY]: state,
        }),
      },
    });
    return opportunity;
  }

  async saveState(tripId: string, state: DecisionCaseStoreState): Promise<void> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    const meta = (trip?.metadata ?? {}) as Record<string, unknown>;
    await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        metadata: toInputJsonValue({
          ...meta,
          [DECISION_CASE_METADATA_KEY]: state,
        }),
      },
    });
  }
}
