import { Injectable } from '@nestjs/common';
import type { HarnessDeterministicValidator } from './deterministic-validator.interface';
import type { HarnessExecutionContext } from '../../runtime/execution-context.types';
import type { HarnessValidationResult } from '../../contracts/validation.types';

/**
 * VERIFY：若 `tripState.budgetOverrun` 存在，校验为有限数且在 [0,1]；
 * 可选通过 `HARNESS_VERIFY_BUDGET_OVERRUN_MAX`（默认 1）收紧上限，超则 L2。
 */
@Injectable()
export class HarnessBudgetOverrunValidator implements HarnessDeterministicValidator {
  readonly name = 'budget-overrun.validator';

  validate(
    _input: unknown,
    context: HarnessExecutionContext,
  ): HarnessValidationResult {
    if (process.env.HARNESS_RELAX_VERIFY_BUDGET_OVERRUN === '1') {
      return {
        passed: true,
        severity: 'L1',
        code: 'BUDGET_OVERRUN_RELAXED',
        message:
          'HARNESS_RELAX_VERIFY_BUDGET_OVERRUN=1: skipping budget overrun check (dev / legacy path only).',
        details: { step: context.step, requestId: context.requestId },
      };
    }

    const vis = context.visibleState as Record<string, unknown>;
    const trip = vis.tripState;
    if (trip == null || typeof trip !== 'object') {
      return {
        passed: true,
        severity: 'L1',
        code: 'BUDGET_OVERRUN_SKIPPED',
        message: 'No tripState; budget overrun check skipped.',
      };
    }
    const raw = (trip as Record<string, unknown>).budgetOverrun;
    if (raw === undefined || raw === null) {
      return {
        passed: true,
        severity: 'L1',
        code: 'BUDGET_OVERRUN_SKIPPED',
        message: 'tripState.budgetOverrun unset; skipped.',
      };
    }
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
      return {
        passed: false,
        severity: 'L2',
        code: 'BUDGET_OVERRUN_INVALID',
        message: 'tripState.budgetOverrun must be a finite number when set.',
        details: { value: raw },
      };
    }
    if (raw < 0 || raw > 1 + 1e-9) {
      return {
        passed: false,
        severity: 'L2',
        code: 'BUDGET_OVERRUN_OUT_OF_RANGE',
        message: 'tripState.budgetOverrun must be within [0, 1] (normalized overrun).',
        details: { value: raw },
      };
    }
    const maxRaw = process.env.HARNESS_VERIFY_BUDGET_OVERRUN_MAX?.trim();
    const maxAllowed =
      maxRaw != null && maxRaw !== '' && Number.isFinite(Number(maxRaw))
        ? Math.min(1, Math.max(0, Number(maxRaw)))
        : 1;
    if (raw > maxAllowed + 1e-9) {
      return {
        passed: false,
        severity: 'L2',
        code: 'BUDGET_OVERRUN_EXCEEDS_CAP',
        message: `tripState.budgetOverrun exceeds configured cap (${maxAllowed}).`,
        details: { value: raw, maxAllowed },
      };
    }
    return {
      passed: true,
      severity: 'L1',
      code: 'BUDGET_OVERRUN_OK',
      message: 'Budget overrun signal within allowed range.',
    };
  }
}
