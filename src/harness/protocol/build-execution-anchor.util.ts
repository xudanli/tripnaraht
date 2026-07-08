import type { TravelContextSnapshot } from '../../travel-context/domain/travel-context.types';
import type { HarnessExecutionAnchor, HarnessRuntimeAuthority } from './execution-anchor.types';

export function buildHarnessExecutionAnchor(input: {
  snapshot: TravelContextSnapshot;
  runtimeAuthority?: HarnessRuntimeAuthority;
  outputSnapshot?: TravelContextSnapshot;
  authorityRunId?: string;
  changedDomains?: HarnessExecutionAnchor['changedDomains'];
}): HarnessExecutionAnchor {
  const { snapshot, outputSnapshot } = input;
  return {
    contextId: snapshot.identity.contextId,
    inputSnapshotId: snapshot.meta.snapshotId,
    inputRevision: snapshot.meta.revision,
    effectivePlanVersion: snapshot.meta.bindings.effectivePlanVersionId,
    worldStateVersion: snapshot.meta.bindings.worldStateVersion,
    constraintVersion: String(snapshot.meta.bindings.constraintsVersion),
    runtimeAuthority: input.runtimeAuthority ?? 'CANONICAL',
    outputSnapshotId: outputSnapshot?.meta.snapshotId,
    outputRevision: outputSnapshot?.meta.revision,
    authorityRunId: input.authorityRunId,
    changedDomains: input.changedDomains,
  };
}

export function assertRevisionMonotonic(
  before: HarnessExecutionAnchor,
  after: HarnessExecutionAnchor,
): { pass: boolean; message?: string } {
  if (after.outputRevision === undefined) {
    return { pass: true };
  }
  if (after.outputRevision <= before.inputRevision) {
    return {
      pass: false,
      message: `Revision did not increase: ${before.inputRevision} -> ${after.outputRevision}`,
    };
  }
  return { pass: true };
}
