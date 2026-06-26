import { Injectable } from '@nestjs/common';
import type { EnvironmentAlternativePlan } from '../../trips/in-trip-execution/types/environment-event.types';
import type { ValidationResult } from '../common/validation-result.types';

@Injectable()
export class InTripRecoveryValidatorService {
  validateAlternativePlan(
    plan: EnvironmentAlternativePlan,
    context: {
      severity: 'yellow' | 'red' | 'green';
      delayMinutes?: number;
    },
  ): ValidationResult & { lateProbabilityBefore: number; lateProbabilityAfter: number } {
    const messages: string[] = [];
    let passed = plan.experienceEquivalence >= 0.6;

    if (plan.bookingRequired) {
      messages.push('需要预订确认');
      passed = false;
    }

    if (context.severity === 'red' && plan.experienceEquivalence < 0.7) {
      messages.push('高风险场景下体验等价度不足');
      passed = false;
    }

    const lateBefore = this.estimateLateProbability(context.delayMinutes ?? 0);
    const lateAfter = this.estimateLateProbability(context.delayMinutes ?? 0, plan.timeAdjustment);

    if (lateAfter >= lateBefore && context.delayMinutes && context.delayMinutes > 30) {
      messages.push('方案未能降低迟到概率');
      passed = false;
    }

    return {
      passed,
      verifierSet: ['execution-advisory', 'environment-plan-heuristic'],
      messages,
      completionRateP10: 1 - lateAfter,
      evidenceRefs: [plan.planId],
      lateProbabilityBefore: lateBefore,
      lateProbabilityAfter: lateAfter,
    };
  }

  estimateLateProbability(delayMinutes: number, adjustment?: string): number {
    let base = Math.min(0.95, 0.2 + delayMinutes / 120);
    if (adjustment?.includes('缓冲') || adjustment?.includes('简餐') || adjustment?.includes('跳过')) {
      base *= 0.5;
    }
    if (adjustment?.includes('延后')) {
      base *= 0.85;
    }
    return Math.round(base * 100) / 100;
  }
}
