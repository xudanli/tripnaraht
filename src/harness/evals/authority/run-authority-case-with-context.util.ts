import type { AuthorityAssertionResult } from './authority-case.schema';
import { runAuthorityCase } from '../assertions/canonical-authority.assertions';
import type { HarnessRuntimeAuthority } from '../../protocol/execution-anchor.types';
import type { TravelContextSnapshot } from '../../../travel-context/domain/travel-context.types';
import { buildAuthorityHarnessAnchor } from './authority-context-anchor.util';

export async function runAuthorityCaseWithContext(input: {
  caseId: string;
  tripId?: string;
  runtimeAuthority?: HarnessRuntimeAuthority;
  outputSnapshot?: TravelContextSnapshot;
  authorityRunId?: string;
  snapshotOverrides?: Partial<TravelContextSnapshot>;
  run: () => Promise<AuthorityAssertionResult[]>;
}) {
  return runAuthorityCase({
    caseId: input.caseId,
    executionAnchor: buildAuthorityHarnessAnchor({
      tripId: input.tripId,
      runtimeAuthority: input.runtimeAuthority,
      outputSnapshot: input.outputSnapshot,
      authorityRunId: input.authorityRunId ?? input.caseId,
      snapshotOverrides: input.snapshotOverrides,
    }),
    run: input.run,
  });
}
