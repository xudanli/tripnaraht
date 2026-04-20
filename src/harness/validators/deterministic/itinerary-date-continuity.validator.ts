import { Injectable } from '@nestjs/common';
import type { HarnessDeterministicValidator } from './deterministic-validator.interface';
import type { HarnessExecutionContext } from '../../runtime/execution-context.types';
import type { HarnessValidationResult } from '../../contracts/validation.types';

const DAY_MS = 86_400_000;

function parseIsoDateOnly(input: unknown): number | null {
  if (typeof input !== 'string') return null;
  const s = input.slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const t = Date.UTC(y, mo, d);
  const chk = new Date(t);
  if (chk.getUTCFullYear() !== y || chk.getUTCMonth() !== mo || chk.getUTCDate() !== d) {
    return null;
  }
  return t;
}

function dayDateFromEntry(day: unknown): unknown {
  if (day == null || typeof day !== 'object') return undefined;
  const o = day as Record<string, unknown>;
  return o.date ?? o.dayDate ?? o.day_date;
}

/**
 * VERIFY：若已有 `tripState.planDraft.days`，校验日期可解析、无重复、按行程顺序递增；
 * 默认要求相邻自然日连续（可 `HARNESS_DATE_CONTINUITY_ALLOW_GAPS=1` 仅要求严格递增）。
 */
@Injectable()
export class HarnessItineraryDateContinuityValidator implements HarnessDeterministicValidator {
  readonly name = 'itinerary-date-continuity.validator';

  validate(
    _input: unknown,
    context: HarnessExecutionContext,
  ): HarnessValidationResult {
    if (process.env.HARNESS_RELAX_VERIFY_DATE_CONTINUITY === '1') {
      return {
        passed: true,
        severity: 'L1',
        code: 'DATE_CONTINUITY_RELAXED',
        message:
          'HARNESS_RELAX_VERIFY_DATE_CONTINUITY=1: skipping itinerary date continuity check (dev / legacy path only).',
        details: { step: context.step, requestId: context.requestId },
      };
    }

    const vis = context.visibleState as Record<string, unknown>;
    const tripState = vis.tripState;
    if (tripState == null || typeof tripState !== 'object') {
      return {
        passed: true,
        severity: 'L1',
        code: 'DATE_CONTINUITY_SKIPPED',
        message: 'No tripState; date continuity skipped.',
      };
    }
    const planDraft = (tripState as Record<string, unknown>).planDraft;
    if (planDraft == null || typeof planDraft !== 'object') {
      return {
        passed: true,
        severity: 'L1',
        code: 'DATE_CONTINUITY_SKIPPED',
        message: 'No planDraft; date continuity skipped.',
      };
    }
    const days = (planDraft as Record<string, unknown>).days;
    if (!Array.isArray(days) || days.length === 0) {
      return {
        passed: true,
        severity: 'L1',
        code: 'DATE_CONTINUITY_SKIPPED',
        message: 'planDraft.days empty; date continuity skipped.',
      };
    }

    const rawDates: unknown[] = days.map((d) => dayDateFromEntry(d));
    const missing = rawDates.filter((x) => x == null || x === '').length;
    if (missing === days.length) {
      return {
        passed: true,
        severity: 'L1',
        code: 'DATE_CONTINUITY_SKIPPED',
        message: 'No day-level dates on itinerary; date continuity skipped.',
      };
    }
    if (missing > 0) {
      return {
        passed: false,
        severity: 'L2',
        code: 'DAY_DATE_INCOMPLETE',
        message: 'Itinerary days must all carry an ISO date (YYYY-MM-DD) when any day is dated.',
        details: { missing, total: days.length },
      };
    }

    const stamps: number[] = [];
    for (const r of rawDates) {
      const t = parseIsoDateOnly(r);
      if (t == null) {
        return {
          passed: false,
          severity: 'L2',
          code: 'DAY_DATE_INVALID',
          message: `Invalid or non-calendar ISO date on itinerary day: ${String(r)}`,
          details: { value: r },
        };
      }
      stamps.push(t);
    }

    const seen = new Set<number>();
    for (const t of stamps) {
      if (seen.has(t)) {
        return {
          passed: false,
          severity: 'L2',
          code: 'DAY_DATE_DUPLICATE',
          message: 'Duplicate calendar dates in itinerary.',
        };
      }
      seen.add(t);
    }

    for (let i = 1; i < stamps.length; i++) {
      if (stamps[i]! <= stamps[i - 1]!) {
        return {
          passed: false,
          severity: 'L2',
          code: 'DAY_ORDER_NOT_CHRONOLOGICAL',
          message: 'Itinerary day dates must appear in strictly increasing order.',
        };
      }
    }

    const allowGaps = process.env.HARNESS_DATE_CONTINUITY_ALLOW_GAPS === '1';
    if (!allowGaps && stamps.length >= 2) {
      for (let i = 1; i < stamps.length; i++) {
        const delta = stamps[i]! - stamps[i - 1]!;
        if (delta !== DAY_MS) {
          return {
            passed: false,
            severity: 'L2',
            code: 'DATE_CONTINUITY_GAP',
            message:
              'Adjacent itinerary days must be consecutive calendar dates (set HARNESS_DATE_CONTINUITY_ALLOW_GAPS=1 to allow rest-day gaps).',
            details: { deltaDays: delta / DAY_MS },
          };
        }
      }
    }

    return {
      passed: true,
      severity: 'L1',
      code: 'DATE_CONTINUITY_OK',
      message: 'Itinerary day dates are parseable, ordered, and meet continuity rules.',
    };
  }
}
