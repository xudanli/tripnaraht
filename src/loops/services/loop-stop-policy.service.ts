import { Injectable } from '@nestjs/common';
import type { LoopDefinition } from '../types/loop-definition.types';
import type { ReadinessRepairSnapshot } from '../types/loop-run.types';

export type StopDecision =
  | { stop: true; reason: string; status: 'COMPLETED' | 'WAITING_FOR_HUMAN' | 'FAILED' }
  | { stop: false };

export interface NoProgressInput {
  previousHardBlockers: number;
  currentHardBlockers: number;
  previousReadiness: number;
  currentReadiness: number;
  recentProposalKeys: string[];
  currentProposalKey: string;
}

@Injectable()
export class LoopStopPolicyService {
  evaluateReadinessRepairSuccess(
    def: LoopDefinition,
    snapshot: ReadinessRepairSnapshot,
  ): StopDecision {
    const criteria = def.successCriteria;
    if (
      snapshot.hardBlockers <= (criteria.hardBlockersMax ?? 0) &&
      snapshot.readinessScore >= (criteria.readinessScoreMin ?? 85) &&
      snapshot.canStartExecute
    ) {
      return { stop: true, reason: 'success_criteria_met', status: 'COMPLETED' };
    }
    return { stop: false };
  }

  evaluateNoProgress(input: NoProgressInput): StopDecision {
    const blockersFlat =
      input.previousHardBlockers === input.currentHardBlockers &&
      input.previousReadiness <= input.currentReadiness;
    const duplicateProposal = input.recentProposalKeys.includes(input.currentProposalKey);

    if (blockersFlat && duplicateProposal) {
      return {
        stop: true,
        reason: 'no_progress_detected',
        status: 'WAITING_FOR_HUMAN',
      };
    }
    return { stop: false };
  }

  evaluateIterationCap(iteration: number, maxIterations: number): StopDecision {
    if (iteration >= maxIterations) {
      return {
        stop: true,
        reason: 'max_iterations_reached',
        status: 'WAITING_FOR_HUMAN',
      };
    }
    return { stop: false };
  }

  evaluateTimeBudgetExceeded(): StopDecision {
    return {
      stop: true,
      reason: 'time_budget_exhausted',
      status: 'FAILED',
    };
  }
}
