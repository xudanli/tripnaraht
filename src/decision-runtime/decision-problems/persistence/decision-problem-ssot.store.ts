/**
 * Trip.metadata — DecisionProblem SSOT store (Phase 3 authority).
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { toInputJsonValue } from '../../../trips/budget-os/utils/prisma-json.util';
import type { EvaluationContextVersion } from '../../constraints/contracts/evaluation-context-version.types';
import type { DecisionProblemDetail } from '../../../trips/decision-semantics/types/decision-semantics.types';

const METADATA_KEY = 'decisionProblemSsot';

export const DECISION_PROBLEM_SSOT_SCHEMA = 'tripnara.decision_problem_ssot@v1' as const;

export interface StoredDecisionProblemSsotState {
  schemaId: typeof DECISION_PROBLEM_SSOT_SCHEMA;
  contextVersion: EvaluationContextVersion;
  synthesizedAt: string;
  byProblemId: Record<string, DecisionProblemDetail>;
}

@Injectable()
export class DecisionProblemSsotStoreService {
  constructor(private readonly prisma: PrismaService) {}

  read(metadata: unknown): StoredDecisionProblemSsotState | null {
    const root = (metadata ?? {}) as Record<string, unknown>;
    const raw = root[METADATA_KEY] as StoredDecisionProblemSsotState | undefined;
    if (!raw?.byProblemId) return null;
    return raw;
  }

  async replaceAll(
    tripId: string,
    problems: DecisionProblemDetail[],
    contextVersion: EvaluationContextVersion,
  ): Promise<StoredDecisionProblemSsotState> {
    const byProblemId: Record<string, DecisionProblemDetail> = {};
    for (const p of problems) {
      byProblemId[p.id] = p;
    }

    const state: StoredDecisionProblemSsotState = {
      schemaId: DECISION_PROBLEM_SSOT_SCHEMA,
      contextVersion,
      synthesizedAt: new Date().toISOString(),
      byProblemId,
    };

    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    const meta = ((trip?.metadata ?? {}) as Record<string, unknown>) ?? {};

    await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        metadata: toInputJsonValue({
          ...meta,
          [METADATA_KEY]: state,
        }),
      },
    });

    return state;
  }

  async list(tripId: string): Promise<DecisionProblemDetail[]> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    const state = this.read(trip?.metadata);
    if (!state) return [];
    return Object.values(state.byProblemId);
  }

  isStale(stored: StoredDecisionProblemSsotState | null, current: EvaluationContextVersion): boolean {
    if (!stored) return true;
    return (
      stored.contextVersion.planVersionId !== current.planVersionId ||
      stored.contextVersion.policyVersion !== current.policyVersion
    );
  }

  /**
   * Read authoritative problems from store; synthesize + persist only when stale or empty.
   */
  async loadAuthoritative(
    tripId: string,
    contextVersion: EvaluationContextVersion,
    synthesize: () => Promise<DecisionProblemDetail[]>,
  ): Promise<{ problems: DecisionProblemDetail[]; fromStore: boolean }> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    const stored = this.read(trip?.metadata);
    const cached = stored ? Object.values(stored.byProblemId) : [];

    if (!this.isStale(stored, contextVersion) && cached.length > 0) {
      return { problems: cached, fromStore: true };
    }

    const problems = await synthesize();
    await this.replaceAll(tripId, problems, contextVersion);
    return { problems, fromStore: false };
  }
}
