import { buildHarnessExecutionAnchor } from '../../protocol/build-execution-anchor.util';
import type { HarnessExecutionAnchor, HarnessRuntimeAuthority } from '../../protocol/execution-anchor.types';
import { buildIcelandPlanningContextFixture } from '../fixtures/contexts/iceland-planning.fixture';
import type { TravelContextSnapshot } from '../../../travel-context/domain/travel-context.types';

/**
 * Binds Authority Harness cases to a Travel Context Revision anchor (RFC-003 H-P1).
 * Uses iceland-planning fixture; tripId from the case overrides fixture tripId.
 */
export function buildAuthorityHarnessAnchor(input: {
  tripId?: string;
  runtimeAuthority?: HarnessRuntimeAuthority;
  outputSnapshot?: TravelContextSnapshot;
  authorityRunId?: string;
  snapshotOverrides?: Partial<TravelContextSnapshot>;
}): HarnessExecutionAnchor {
  const tripId = input.tripId ?? 'trip_iceland_fixture';
  const baseFixture = buildIcelandPlanningContextFixture();
  const base = buildIcelandPlanningContextFixture({
    ...input.snapshotOverrides,
    identity: {
      ...baseFixture.identity,
      ...(input.snapshotOverrides?.identity ?? {}),
      tripId,
    },
  });

  return buildHarnessExecutionAnchor({
    snapshot: base,
    runtimeAuthority: input.runtimeAuthority ?? 'LEGACY',
    outputSnapshot: input.outputSnapshot,
    authorityRunId: input.authorityRunId ?? `authority_${tripId}`,
  });
}

export function assertAuthorityResultHasAnchor(
  result: { executionAnchor?: HarnessExecutionAnchor },
  input?: { minRevision?: number; runtimeAuthority?: HarnessRuntimeAuthority },
): void {
  expect(result.executionAnchor).toBeDefined();
  const anchor = result.executionAnchor!;
  expect(anchor.contextId).toBeTruthy();
  expect(anchor.inputSnapshotId).toMatch(/^tctx_/);
  expect(anchor.inputRevision).toBeGreaterThan(0);
  if (input?.minRevision !== undefined) {
    expect(anchor.inputRevision).toBeGreaterThanOrEqual(input.minRevision);
  }
  if (input?.runtimeAuthority) {
    expect(anchor.runtimeAuthority).toBe(input.runtimeAuthority);
  }
}
