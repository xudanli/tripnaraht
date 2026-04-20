import { Injectable } from '@nestjs/common';
import type { HarnessDeterministicValidator } from './deterministic-validator.interface';
import type { HarnessExecutionContext } from '../../runtime/execution-context.types';
import type { HarnessValidationResult } from '../../contracts/validation.types';

/** 防止异常 / 注入式极大金额；与业务「硬顶」无关，仅数据卫生 */
const MAX_USER_BUDGET_ABS = 1e12;

type ParsedBudget =
  | { kind: 'skip' }
  | { kind: 'invalid'; code: 'USER_INTENT_BUDGET_INVALID_TYPE' }
  | { kind: 'ok'; value: number };

function parseUserBudget(raw: unknown): ParsedBudget {
  if (raw === undefined || raw === null) return { kind: 'skip' };
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return { kind: 'invalid', code: 'USER_INTENT_BUDGET_INVALID_TYPE' };
    return { kind: 'ok', value: raw };
  }
  if (typeof raw === 'string') {
    const s = raw.trim();
    if (s === '') return { kind: 'skip' };
    const n = Number(s);
    if (!Number.isFinite(n)) return { kind: 'invalid', code: 'USER_INTENT_BUDGET_INVALID_TYPE' };
    return { kind: 'ok', value: n };
  }
  return { kind: 'invalid', code: 'USER_INTENT_BUDGET_INVALID_TYPE' };
}

/**
 * RESEARCH / INTAKE / PLAN_GEN：若投影中 `userIntent.budget` 已设置（**number** 或可 `Number()` 的 **数值字符串**），则须为有限正数且不超过保守上界。
 */
@Injectable()
export class HarnessUserIntentBudgetValidator implements HarnessDeterministicValidator {
  readonly name = 'user-intent-budget.validator';

  validate(
    _input: unknown,
    context: HarnessExecutionContext,
  ): HarnessValidationResult {
    if (process.env.HARNESS_RELAX_USER_INTENT_BUDGET === '1') {
      return {
        passed: true,
        severity: 'L1',
        code: 'USER_INTENT_BUDGET_RELAXED',
        message:
          'HARNESS_RELAX_USER_INTENT_BUDGET=1: skipping userIntent.budget sanity check (dev / legacy path only).',
        details: { step: context.step, requestId: context.requestId },
      };
    }

    const vis = context.visibleState as Record<string, unknown>;
    const ui = vis.userIntent;
    if (ui == null || typeof ui !== 'object') {
      return {
        passed: true,
        severity: 'L1',
        code: 'USER_INTENT_BUDGET_SKIPPED',
        message: 'No userIntent in visible state; budget check skipped.',
      };
    }
    const raw = (ui as Record<string, unknown>).budget;
    const parsed = parseUserBudget(raw);
    if (parsed.kind === 'skip') {
      return {
        passed: true,
        severity: 'L1',
        code: 'USER_INTENT_BUDGET_SKIPPED',
        message: 'userIntent.budget unset or empty; skipped.',
      };
    }
    if (parsed.kind === 'invalid') {
      return {
        passed: false,
        severity: 'L2',
        code: parsed.code,
        message:
          'userIntent.budget must be a finite number or a numeric string (e.g. from JSON) when set.',
        details: { value: raw },
      };
    }
    const value = parsed.value;
    if (value <= 0) {
      return {
        passed: false,
        severity: 'L2',
        code: 'USER_INTENT_BUDGET_NON_POSITIVE',
        message: 'userIntent.budget must be positive when set.',
        details: { value: raw, parsed: value },
      };
    }
    if (value > MAX_USER_BUDGET_ABS) {
      return {
        passed: false,
        severity: 'L2',
        code: 'USER_INTENT_BUDGET_TOO_LARGE',
        message: `userIntent.budget exceeds sanity bound (${MAX_USER_BUDGET_ABS}).`,
        details: { value: raw, parsed: value },
      };
    }
    return {
      passed: true,
      severity: 'L1',
      code: 'USER_INTENT_BUDGET_OK',
      message: 'userIntent.budget is a finite positive amount within sanity bound.',
    };
  }
}
