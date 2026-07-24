/**
 * Bridges DecisionRecord → feasibility.applyRepair / gate repair bridge execution.
 */

import { BadRequestException, Injectable } from '@nestjs/common';
import { FeasibilityReportService } from '../../trip-constraint-solver/services/feasibility-report.service';
import type { FeasibilityIssueDto } from '../../trip-constraint-solver/types/trip-constraint-solver.types';
import type {
  CreateDecisionRequestBody,
  DecisionProblemDetail,
  TripMutationSet,
} from '../types/decision-semantics.types';
import type { ApplyRepairResponse } from '../../readiness/types/coverage-map.types';
import type { PostApplyCoherenceResult } from '../execution/decision-post-apply-coherence.util';
import { runPostApplyCoherenceCheck } from '../execution/decision-post-apply-coherence.util';
import {
  canPlanGateRepair,
  isGateOptionId,
  planGateRepairAsync,
} from '../repair/gate-repair-bridge.util';

export interface DecisionRepairExecuteInput {
  tripId: string;
  userId: string;
  issue: FeasibilityIssueDto;
  body: CreateDecisionRequestBody;
}

export interface DecisionGateRepairExecuteInput {
  tripId: string;
  userId: string;
  body: CreateDecisionRequestBody;
  detail: DecisionProblemDetail;
  feasibilityIssues: FeasibilityIssueDto[];
}

export interface DecisionRepairExecuteResult {
  applied: boolean;
  applyResult?: ApplyRepairResponse | Record<string, unknown>;
  mutationsPatch?: Partial<TripMutationSet>;
  postApplyCoherence?: PostApplyCoherenceResult;
}

@Injectable()
export class DecisionRepairExecutorService {
  constructor(private readonly feasibility: FeasibilityReportService) {}

  canExecuteRepair(optionId: string, issue?: FeasibilityIssueDto): boolean {
    if (!issue) return false;
    if (optionId.startsWith('planb_')) return false;
    if (optionId.startsWith('ack_')) return false;
    if (optionId === 'fallback_review') return false;
    return true;
  }

  canExecuteGateRepair(
    optionId: string,
    detail: DecisionProblemDetail,
    feasibilityIssues: FeasibilityIssueDto[],
  ): boolean {
    if (!isGateOptionId(optionId)) return false;
    return canPlanGateRepair(optionId, detail, feasibilityIssues);
  }

  async executeGateRepair(input: DecisionGateRepairExecuteInput): Promise<DecisionRepairExecuteResult> {
    const { tripId, userId, body, detail, feasibilityIssues } = input;
    if (!isGateOptionId(body.selectedOptionId)) {
      return { applied: false };
    }

    const plan = await planGateRepairAsync({
      optionId: body.selectedOptionId,
      detail,
      issues: feasibilityIssues,
      loadRepairOptions: async (issueId) => {
        try {
          const resp = await this.feasibility.getRepairOptions(tripId, issueId);
          return resp.options ?? [];
        } catch {
          return [];
        }
      },
    });

    if (!plan) {
      return { applied: false };
    }

    if (plan.kind === 'validate_trip') {
      try {
        await this.feasibility.validate(tripId, {});
        return {
          applied: true,
          applyResult: {
            tripId,
            status: 'applied',
            message: '已触发可行性重算',
            actionType: 'revalidate_feasibility',
            optionId: body.selectedOptionId,
          },
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        throw new BadRequestException(`DECISION_GATE_VALIDATE_FAILED: ${message}`);
      }
    }

    return this.executeRepair({
      tripId,
      userId,
      issue: plan.issue,
      body: {
        ...body,
        selectedOptionId: plan.optionId,
      },
    });
  }

  async executeRepair(input: DecisionRepairExecuteInput): Promise<DecisionRepairExecuteResult> {
    const { tripId, userId, issue, body } = input;
    if (!this.canExecuteRepair(body.selectedOptionId, issue)) {
      return { applied: false };
    }

    try {
      const applyResult = await this.feasibility.applyRepair(
        tripId,
        issue.id,
        {
          optionId: body.selectedOptionId,
          reason: body.reason,
          executeDecision: body.executeDecision ?? true,
          persistDecision: body.persistDecision ?? true,
          runGuardianNegotiation: body.runGuardianNegotiation ?? false,
          forceDecisionRepair: body.forceDecisionRepair,
          parkingReservationRef: body.parkingReservationRef,
          evidenceAttachmentId: body.evidenceAttachmentId,
        },
        userId,
      );

      const status = String((applyResult as ApplyRepairResponse).status ?? '');
      if (status === 'deferred') {
        return { applied: false, applyResult: applyResult as ApplyRepairResponse };
      }

      if (status !== 'applied' && status !== 'redirect') {
        return { applied: false, applyResult: applyResult as ApplyRepairResponse };
      }

      const persistence = (applyResult as ApplyRepairResponse).persistence;
      const mutationsPatch: Partial<TripMutationSet> | undefined = persistence
        ? {
            operations: [
              ...(persistence.createdItemIds?.map((id) => ({
                operation: 'ADD' as const,
                entityType: 'ITINERARY_ITEM' as const,
                entityId: id,
                semanticEffects: [],
              })) ?? []),
              ...(persistence.removedItemIds?.map((id) => ({
                operation: 'REMOVE' as const,
                entityType: 'ITINERARY_ITEM' as const,
                entityId: id,
                semanticEffects: [],
              })) ?? []),
              ...(persistence.updatedItemIds?.map((id) => ({
                operation: 'UPDATE' as const,
                entityType: 'ITINERARY_ITEM' as const,
                entityId: id,
                semanticEffects: [],
              })) ?? []),
            ],
          }
        : undefined;

      const feasibilityExt = this.feasibility as FeasibilityReportService & {
        rollbackLastRepair?: (tripId: string) => Promise<{ ok: boolean }>;
      };

      const postApplyCoherence = await runPostApplyCoherenceCheck({
        tripId,
        validate: (id) => this.feasibility.validate(id, {}),
        rollback: feasibilityExt.rollbackLastRepair
          ? (id) => feasibilityExt.rollbackLastRepair!(id)
          : undefined,
      });

      if (postApplyCoherence.outcome === 'ROLLED_BACK') {
        return {
          applied: false,
          postApplyCoherence,
          applyResult: {
            ...(applyResult as ApplyRepairResponse),
            status: 'rolled_back',
            message: postApplyCoherence.failureMessage ?? 'Post-apply route recalc failed; rolled back',
          },
        };
      }

      if (postApplyCoherence.outcome === 'PARTIALLY_APPLIED') {
        return {
          applied: true,
          postApplyCoherence,
          applyResult: {
            ...(applyResult as ApplyRepairResponse),
            status: 'partially_applied',
            message: postApplyCoherence.failureMessage ?? 'Itinerary updated; route recalc pending repair',
          },
          mutationsPatch,
        };
      }

      return {
        applied: true,
        applyResult: applyResult as ApplyRepairResponse,
        mutationsPatch,
        postApplyCoherence,
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      throw new BadRequestException(`DECISION_APPLY_FAILED: ${message}`);
    }
  }
}
