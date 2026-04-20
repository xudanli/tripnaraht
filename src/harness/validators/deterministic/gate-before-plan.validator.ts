import { Injectable } from '@nestjs/common';
import type { ConstraintReport } from '../../../decision/kernel/decision-state.types';
import type { HarnessDeterministicValidator } from './deterministic-validator.interface';
import type { HarnessExecutionContext } from '../../runtime/execution-context.types';
import type { HarnessValidationResult } from '../../contracts/validation.types';

type VisiblePlan = {
  constraints?: ConstraintReport;
};

/**
 * PLAN_GEN 前：Gate 不得为 BLOCK；须已有 gate 结论（constraints.gateOutcome）。
 */
@Injectable()
export class HarnessGateBeforePlanValidator implements HarnessDeterministicValidator {
  readonly name = 'gate-before-plan.validator';

  validate(
    _input: unknown,
    context: HarnessExecutionContext,
  ): HarnessValidationResult {
    const vis = context.visibleState as VisiblePlan;
    const outcome = vis.constraints?.gateOutcome;

    if (!outcome) {
      return {
        passed: false,
        severity: 'L2',
        code: 'GATE_MISSING',
        message: 'PLAN_GEN requires constraints.gateOutcome before planning.',
        details: { step: context.step },
      };
    }
    if (outcome === 'BLOCK') {
      return {
        passed: false,
        severity: 'L3',
        code: 'GATE_BLOCK',
        message: 'Gate BLOCK: PLAN_GEN is not allowed.',
        details: { gateOutcome: outcome },
      };
    }
    return {
      passed: true,
      severity: 'L1',
      code: 'GATE_BEFORE_PLAN_OK',
      message: 'Gate outcome allows planning.',
    };
  }
}
