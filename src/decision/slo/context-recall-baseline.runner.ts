import type {
  ContextRecallBaselineCase,
  ContextRecallBaselineReport,
  ContextRecallCaseResult,
} from './context-recall-baseline.types';
import { CONTEXT_RECALL_TARGET_PCT_T6 } from './context-recall-baseline.types';
import { CONTEXT_RECALL_BASELINE_CASES } from './context-recall-baseline.cases';

function getAtPath(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

export function isContextFieldPresent(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value as object).length > 0;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return true;
  return false;
}

export function scoreContextRecallCase(caseDef: ContextRecallBaselineCase): ContextRecallCaseResult {
  const hits: string[] = [];
  const misses: string[] = [];
  for (const path of caseDef.mustPresent) {
    if (isContextFieldPresent(getAtPath(caseDef.context, path))) {
      hits.push(path);
    } else {
      misses.push(path);
    }
  }

  const forbiddenPresent: string[] = [];
  for (const path of caseDef.mustAbsent ?? []) {
    if (isContextFieldPresent(getAtPath(caseDef.context, path))) {
      forbiddenPresent.push(path);
    }
  }

  const denom = caseDef.mustPresent.length;
  const recallPct = denom === 0 ? 100 : Math.round((hits.length / denom) * 10000) / 100;
  const passed = misses.length === 0 && forbiddenPresent.length === 0;

  return {
    id: caseDef.id,
    title: caseDef.title,
    passed,
    recallPct,
    hits,
    misses,
    forbiddenPresent,
  };
}

export function runContextRecallBaseline(
  cases: ContextRecallBaselineCase[] = CONTEXT_RECALL_BASELINE_CASES,
): ContextRecallBaselineReport {
  const results = cases.map(scoreContextRecallCase);
  const passedCases = results.filter((r) => r.passed).length;
  const recallPct =
    results.length === 0
      ? 100
      : Math.round((results.reduce((s, r) => s + r.recallPct, 0) / results.length) * 100) / 100;

  return {
    generatedAt: new Date().toISOString(),
    totalCases: results.length,
    passedCases,
    recallPct,
    targetPctT6: CONTEXT_RECALL_TARGET_PCT_T6,
    deltaVsTargetPct: Math.round((recallPct - CONTEXT_RECALL_TARGET_PCT_T6) * 100) / 100,
    results,
  };
}
