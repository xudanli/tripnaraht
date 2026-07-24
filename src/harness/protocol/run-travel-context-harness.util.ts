import type { ContextAuthorityTrace } from './execution-anchor.types';
import type { TravelContextHarnessAssertion, TravelContextHarnessCaseResult } from './harness-case.types';
import { buildHarnessExecutionAnchor } from './build-execution-anchor.util';
import type { TravelContextSnapshot } from '../../travel-context/domain/travel-context.types';
import {
  evaluateContextInvariants,
  type InvariantResult,
} from '../invariants/context-invariant.registry';

export async function runTravelContextHarnessCase(input: {
  caseId: string;
  snapshot: TravelContextSnapshot;
  outputSnapshot?: TravelContextSnapshot;
  invariantIds?: string[];
  trace?: ContextAuthorityTrace;
  run: () => Promise<TravelContextHarnessAssertion[]>;
  runtimeAuthority?: 'CANONICAL' | 'LEGACY' | 'SHADOW';
  authorityRunId?: string;
}): Promise<TravelContextHarnessCaseResult> {
  const startedAt = new Date().toISOString();
  const errors: string[] = [];
  let assertions: TravelContextHarnessAssertion[] = [];
  let invariantResults: InvariantResult[] = [];

  const anchor = buildHarnessExecutionAnchor({
    snapshot: input.snapshot,
    outputSnapshot: input.outputSnapshot,
    runtimeAuthority: input.runtimeAuthority,
    authorityRunId: input.authorityRunId,
  });

  try {
    assertions = await input.run();

    if (input.invariantIds?.length && input.outputSnapshot && input.trace) {
      invariantResults = evaluateContextInvariants({
        invariantIds: input.invariantIds,
        before: input.snapshot,
        after: input.outputSnapshot,
        trace: input.trace,
      });
      for (const inv of invariantResults) {
        if (!inv.pass) {
          errors.push(`[invariant:${inv.invariantId}] ${inv.message ?? 'failed'}`);
        }
      }
    }

    for (const a of assertions) {
      if (!a.pass) {
        errors.push(`[assertion:${a.name}] ${a.message ?? 'failed'}`);
      }
    }
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
  }

  return {
    caseId: input.caseId,
    pass: errors.length === 0,
    assertions,
    errors,
    startedAt,
    finishedAt: new Date().toISOString(),
    anchor,
    invariantResults: invariantResults.length ? invariantResults : undefined,
  };
}

export function expectTravelContextHarnessPass(result: TravelContextHarnessCaseResult): void {
  if (!result.pass) {
    throw new Error(
      `${result.caseId} failed:\n${result.errors.join('\n')}\n` +
        `anchor: input rev ${result.anchor.inputRevision}` +
        (result.anchor.outputRevision !== undefined
          ? ` → output rev ${result.anchor.outputRevision}`
          : ''),
    );
  }
}

export function harnessAssert(input: {
  name: string;
  pass: boolean;
  expected?: unknown;
  actual?: unknown;
  message?: string;
}): TravelContextHarnessAssertion {
  return {
    name: input.name,
    pass: input.pass,
    expected: input.expected,
    actual: input.actual,
    message: input.pass ? undefined : input.message ?? `Assertion failed: ${input.name}`,
  };
}
