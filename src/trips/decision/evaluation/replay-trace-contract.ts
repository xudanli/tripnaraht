import type {
  DecisionTraceSummary,
  E2EDiff,
  ExpectedDecisionTraceSummary,
  StructuredDiffItem,
} from './e2e-case.types';
import type { DecisionLogEntry } from '../shared/decision-result.types';

export const TRACE_METADATA_WHITELIST = [
  'schemaVersion',
  'metaDecisionAudit',
  'candidateSearchBudget',
  'candidateSearchAudit',
] as const;

export const REPLAY_LOG_METADATA_WHITELIST = [
  'metaDecisionAudit',
  'candidateSearchBudget',
  'candidateSearchAudit',
] as const;

function deepPickLike(actual: unknown, expectedShape: unknown): unknown {
  if (expectedShape === null || typeof expectedShape !== 'object') return actual;
  if (Array.isArray(expectedShape)) {
    if (!Array.isArray(actual)) return actual;
    const out: unknown[] = [];
    for (let i = 0; i < expectedShape.length; i++) {
      out.push(deepPickLike(actual[i], expectedShape[i]));
    }
    return out;
  }
  if (actual === null || typeof actual !== 'object' || Array.isArray(actual)) return actual;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(expectedShape as Record<string, unknown>)) {
    out[key] = deepPickLike(
      (actual as Record<string, unknown>)[key],
      (expectedShape as Record<string, unknown>)[key],
    );
  }
  return out;
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v)).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  return `{${entries
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`)
    .join(',')}}`;
}

export function buildDecisionTraceSummary(logs: DecisionLogEntry[]): DecisionTraceSummary {
  const summarySource = logs.find(
    (log) =>
      !!(log.metadata as Record<string, unknown> | undefined)?.candidateSearchAudit ||
      !!(log.metadata as Record<string, unknown> | undefined)?.metaDecisionAudit,
  );
  const meta = (summarySource?.metadata ?? {}) as Record<string, unknown>;
  return {
    schemaVersion:
      typeof meta.schemaVersion === 'string' ? (meta.schemaVersion as any) : 'trace/v1',
    metaDecisionAudit:
      typeof meta.metaDecisionAudit === 'string' ? meta.metaDecisionAudit : undefined,
    candidateSearchBudget: meta.candidateSearchBudget as any,
    candidateSearchAudit: meta.candidateSearchAudit as any,
  };
}

export function diffDecisionTraceSummary(
  expected: ExpectedDecisionTraceSummary | undefined,
  actual: DecisionTraceSummary | undefined,
): NonNullable<E2EDiff['traceDiff']> {
  if (!expected) return [];
  const diffs: NonNullable<E2EDiff['traceDiff']> = [];
  const actualSummary = (actual ?? { schemaVersion: 'trace/v1' }) as DecisionTraceSummary;
  for (const key of TRACE_METADATA_WHITELIST) {
    if (!(key in expected)) continue;
    const expectedValue = expected[key];
    const left = stableStringify(expectedValue);
    const rightComparable =
      expectedValue && typeof expectedValue === 'object'
        ? deepPickLike(actualSummary[key], expectedValue)
        : actualSummary[key];
    const right = stableStringify(rightComparable);
    if (left !== right) {
      diffs.push({
        key,
        expected: expectedValue,
        actual: rightComparable,
        message: `trace.${key}: expected=${left} actual=${right}`,
      });
    }
  }
  return diffs;
}

export type ReplayLogDiff = {
  expected: DecisionLogEntry;
  actual: DecisionLogEntry;
  diffs: Array<StructuredDiffItem<string>>;
};

export function buildReplayLogDiffs(
  expectedLogs: DecisionLogEntry[],
  actualLogs: DecisionLogEntry[],
): ReplayLogDiff[] {
  const count = Math.min(expectedLogs.length, actualLogs.length);
  const out: ReplayLogDiff[] = [];
  for (let i = 0; i < count; i++) {
    const expected = expectedLogs[i];
    const actual = actualLogs[i];
    const expectedMeta = (expected.metadata ?? {}) as Record<string, unknown>;
    const actualMeta = (actual.metadata ?? {}) as Record<string, unknown>;
    const diffs: Array<StructuredDiffItem<string>> = [];
    for (const k of REPLAY_LOG_METADATA_WHITELIST) {
      if (!(k in expectedMeta)) continue;
      const left = stableStringify(expectedMeta[k]);
      const right = stableStringify(actualMeta[k]);
      if (left !== right) {
        diffs.push({
          key: `metadata.${k}`,
          expected: expectedMeta[k],
          actual: actualMeta[k],
          message: `metadata.${k}: expected=${left} actual=${right}`,
        });
      }
    }
    if (diffs.length > 0) {
      out.push({ expected, actual, diffs });
    }
  }
  if (expectedLogs.length !== actualLogs.length) {
    out.push({
      expected: expectedLogs[Math.max(0, expectedLogs.length - 1)] ?? ({} as DecisionLogEntry),
      actual: actualLogs[Math.max(0, actualLogs.length - 1)] ?? ({} as DecisionLogEntry),
      diffs: [
        {
          key: 'logCount',
          expected: expectedLogs.length,
          actual: actualLogs.length,
          message: `log count mismatch: expected=${expectedLogs.length} actual=${actualLogs.length}`,
        },
      ],
    });
  }
  return out;
}
