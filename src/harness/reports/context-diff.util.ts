import type { TravelContextDomain } from '../../travel-context/domain/travel-context.constants';
import type { TravelContextSnapshot } from '../../travel-context/domain/travel-context.types';
import type { TravelContextHarnessAssertion } from '../protocol/harness-case.types';
import { harnessAssert } from '../protocol/run-travel-context-harness.util';
import {
  computeTravelContextDiff as computeDiffCore,
  type ContextDiffChange,
  type ContextDiffOperation,
  type TravelContextDiff,
} from '../../travel-context/diff/travel-context-diff.util';

export type { ContextDiffChange, ContextDiffOperation, TravelContextDiff };

export interface ContextDiffExpectation {
  minChanges?: number;
  requiredPaths?: string[];
  requiredOperations?: Partial<Record<string, ContextDiffOperation>>;
  forbiddenPaths?: string[];
  requiredDomains?: TravelContextDomain[];
  forbiddenDomains?: TravelContextDomain[];
}

/** Compute RFC-003 Context Diff between two snapshots (harness wrapper). */
export function computeTravelContextDiff(
  before: TravelContextSnapshot,
  after: TravelContextSnapshot,
): Omit<TravelContextDiff, 'contextId' | 'requiresFullRefresh'> {
  const diff = computeDiffCore(before.identity.contextId, before, after);
  return {
    fromRevision: diff.fromRevision,
    toRevision: diff.toRevision,
    changedDomains: diff.changedDomains,
    changes: diff.changes,
  };
}

export function assertContextDiffExpectations(
  diff: TravelContextDiff,
  expected: ContextDiffExpectation,
): TravelContextHarnessAssertion[] {
  const assertions: TravelContextHarnessAssertion[] = [];
  const paths = diff.changes.map((c) => c.path);

  if (expected.minChanges !== undefined) {
    assertions.push(
      harnessAssert({
        name: 'diff_min_changes',
        pass: diff.changes.length >= expected.minChanges,
        expected: `>= ${expected.minChanges}`,
        actual: diff.changes.length,
      }),
    );
  }

  for (const reqPath of expected.requiredPaths ?? []) {
    assertions.push(
      harnessAssert({
        name: `diff_has_path_${reqPath.replace(/\./g, '_')}`,
        pass: paths.some((p) => p === reqPath || p.startsWith(`${reqPath}.`)),
        expected: reqPath,
        actual: paths,
      }),
    );
  }

  for (const [reqPath, op] of Object.entries(expected.requiredOperations ?? {})) {
    assertions.push(
      harnessAssert({
        name: `diff_operation_${reqPath.replace(/\./g, '_')}_${op}`,
        pass: diff.changes.some((c) => c.path === reqPath && c.operation === op),
        expected: { path: reqPath, operation: op },
        actual: diff.changes.filter((c) => c.path === reqPath),
      }),
    );
  }

  for (const forbidden of expected.forbiddenPaths ?? []) {
    assertions.push(
      harnessAssert({
        name: `diff_forbidden_path_${forbidden.replace(/\./g, '_')}`,
        pass: !paths.some((p) => p === forbidden || p.startsWith(`${forbidden}.`)),
        expected: 'absent',
        actual: paths.filter((p) => p.startsWith(forbidden)),
      }),
    );
  }

  for (const domain of expected.requiredDomains ?? []) {
    assertions.push(
      harnessAssert({
        name: `diff_domain_${domain}`,
        pass: diff.changedDomains.includes(domain),
        expected: domain,
        actual: diff.changedDomains,
      }),
    );
  }

  for (const domain of expected.forbiddenDomains ?? []) {
    assertions.push(
      harnessAssert({
        name: `diff_forbidden_domain_${domain}`,
        pass: !diff.changedDomains.includes(domain),
        expected: 'unchanged',
        actual: diff.changedDomains,
      }),
    );
  }

  assertions.push(
    harnessAssert({
      name: 'diff_revision_monotonic',
      pass: diff.toRevision > diff.fromRevision,
      expected: `> ${diff.fromRevision}`,
      actual: diff.toRevision,
    }),
  );

  return assertions;
}

export function summarizeContextDiff(diff: TravelContextDiff): string {
  const ops = diff.changes.reduce(
    (acc, c) => {
      acc[c.operation] = (acc[c.operation] ?? 0) + 1;
      return acc;
    },
    {} as Record<ContextDiffOperation, number>,
  );
  return `rev ${diff.fromRevision}→${diff.toRevision} domains=[${diff.changedDomains.join(',')}] ops=${JSON.stringify(ops)}`;
}
