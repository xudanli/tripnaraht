import type { TravelContextHarnessCaseResult } from '../protocol/harness-case.types';
import type { TravelContextSnapshot } from '../../travel-context/domain/travel-context.types';
import {
  importProductionTraceToHarnessCase,
  type ProductionTraceImportOptions,
} from './production-trace-importer';
import type { ProductionTravelContextTrace } from './production-trace.types';
import { runTravelContextHarnessCase } from '../protocol/run-travel-context-harness.util';
import {
  readReplaySnapshotFixture,
  readReplayTraceFixture,
} from './fixture-store.util';

export interface ReplayHarnessInput {
  trace: ProductionTravelContextTrace;
  snapshot: TravelContextSnapshot;
  outputSnapshot?: TravelContextSnapshot;
  runAssertions: () => Promise<import('../protocol/harness-case.types').TravelContextHarnessAssertion[]>;
}

/**
 * Replay a production trace against a frozen Context Snapshot fixture.
 */
export async function replayProductionTraceHarness(
  input: ReplayHarnessInput,
): Promise<TravelContextHarnessCaseResult & { harnessCaseId: string; fixtureId: string }> {
  const imported = importProductionTraceToHarnessCase(input.trace, {
    snapshot: input.snapshot,
    outputSnapshot: input.outputSnapshot,
    persistFixtures: false,
  });

  const result = await runTravelContextHarnessCase({
    caseId: imported.harnessCase.caseId,
    snapshot: input.snapshot,
    outputSnapshot: input.outputSnapshot,
    invariantIds: imported.harnessCase.expect.invariants,
    trace: input.outputSnapshot
      ? {
          authorityRunId: input.trace.traceId,
          inputContext: {
            snapshotId: input.trace.inputAnchor.inputSnapshotId,
            revision: input.trace.inputAnchor.inputRevision,
          },
          authority: {
            runtime: input.trace.inputAnchor.runtimeAuthority,
            gateway: 'ProductionReplayHarness',
            policyVersion: 'harness-v1',
          },
          outputContext: {
            snapshotId: input.outputSnapshot.meta.snapshotId,
            revision: input.outputSnapshot.meta.revision,
          },
          changedDomains: input.trace.inputAnchor.changedDomains ?? [],
        }
      : undefined,
    runtimeAuthority: input.trace.inputAnchor.runtimeAuthority,
    authorityRunId: input.trace.traceId,
    run: input.runAssertions,
  });

  return {
    ...result,
    harnessCaseId: imported.harnessCase.caseId,
    fixtureId: imported.fixtureId,
  };
}

/** Load persisted replay fixtures and run regression harness. */
export async function replayProductionTraceFromFixtures(input: {
  fixtureId: string;
  fixtureBaseDir?: string;
  outputSnapshot?: TravelContextSnapshot;
  importOptions?: ProductionTraceImportOptions;
  runAssertions: ReplayHarnessInput['runAssertions'];
}): Promise<
  (TravelContextHarnessCaseResult & { harnessCaseId: string; fixtureId: string }) | null
> {
  const snapshot = readReplaySnapshotFixture(input.fixtureId, input.fixtureBaseDir);
  const trace = readReplayTraceFixture(input.fixtureId, input.fixtureBaseDir);
  if (!snapshot || !trace) return null;

  if (input.importOptions?.snapshot) {
    importProductionTraceToHarnessCase(trace, input.importOptions);
  }

  return replayProductionTraceHarness({
    trace,
    snapshot,
    outputSnapshot: input.outputSnapshot,
    runAssertions: input.runAssertions,
  });
}
