/**
 * Fail-open / fail-closed policy by constraint category.
 * @see ADR-006-Unified-Decision-Runtime.md
 */

import { Injectable } from '@nestjs/common';
import type { ConstraintEvaluationStatus } from './contracts/constraint-assertion';

export type ConstraintFailureCategory =
  | 'SAFETY_HARD'
  | 'REGULATORY'
  | 'OPERATIONAL'
  | 'PREFERENCE'
  | 'RECOMMENDATION';

export interface ProviderFailureContext {
  provider: string;
  constraintType?: string;
  reasonCode?: string;
  error: unknown;
}

@Injectable()
export class ConstraintFailurePolicyService {
  classifyConstraintType(constraintType: string): ConstraintFailureCategory {
    const upper = constraintType.toUpperCase();
    if (
      /ROAD|HAZARD|WEATHER.*PROHIB|RED_ALERT|FROAD|CLOSED|BORDER|VISA|SAFETY|FERRY|DANGER/i.test(
        upper,
      )
    ) {
      return 'SAFETY_HARD';
    }
    if (/PERMIT|LICENSE|REGULAT|OFFICIAL|LEGAL/i.test(upper)) {
      return 'REGULATORY';
    }
    if (/BOOKING|OPENING|CLOSURE|CAPACITY|RESERVATION/i.test(upper)) {
      return 'OPERATIONAL';
    }
    if (/BUDGET|PACE|PREFERENCE|RHYTHM|LOAD|FATIGUE/i.test(upper)) {
      return 'PREFERENCE';
    }
    return 'RECOMMENDATION';
  }

  /** Status emitted when a provider throws or returns no data for a category. */
  statusOnProviderFailure(category: ConstraintFailureCategory): ConstraintEvaluationStatus {
    switch (category) {
      case 'SAFETY_HARD':
      case 'REGULATORY':
        return 'REQUIRES_VERIFICATION';
      case 'OPERATIONAL':
        return 'REQUIRES_VERIFICATION';
      case 'PREFERENCE':
      case 'RECOMMENDATION':
        return 'WARNING';
      default:
        return 'UNKNOWN';
    }
  }

  shouldMarkDegraded(category: ConstraintFailureCategory): boolean {
    return category === 'PREFERENCE' || category === 'RECOMMENDATION';
  }

  buildProviderFailureAssertion(input: ProviderFailureContext & { tripId: string }): {
    constraintType: string;
    status: ConstraintEvaluationStatus;
    severity: 'HIGH' | 'MEDIUM' | 'LOW';
    reasonCode: string;
    message: string;
    degraded: boolean;
  } {
    const constraintType = input.constraintType ?? 'PROVIDER_EVALUATION';
    const category = this.classifyConstraintType(constraintType);
    const status = this.statusOnProviderFailure(category);
    const message =
      input.error instanceof Error
        ? `${input.provider} 评估失败: ${input.error.message}`
        : `${input.provider} 评估失败`;

    return {
      constraintType,
      status,
      severity: category === 'SAFETY_HARD' ? 'HIGH' : 'MEDIUM',
      reasonCode: input.reasonCode ?? 'PROVIDER_EVALUATION_FAILED',
      message,
      degraded: this.shouldMarkDegraded(category),
    };
  }
}
