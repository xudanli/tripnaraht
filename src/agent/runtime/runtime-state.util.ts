/**
 * Helpers to merge partial updates into UnifiedRuntimeState without deep cloning libraries.
 */

import type { UnifiedRuntimeState } from './runtime-state.types';
import { RUNTIME_UNIFIED_STATE_SCHEMA } from './runtime-state.types';

export function emptyUnifiedRuntimeState(queryId: string): UnifiedRuntimeState {
  return {
    schema: RUNTIME_UNIFIED_STATE_SCHEMA,
    queryId,
    phi: null,
    epsilon: null,
    causalKernel: null,
    kThetaFingerprint: null,
    artifactRefs: [],
  };
}

export function mergeUnifiedRuntimeState(
  base: UnifiedRuntimeState,
  patch: Partial<Omit<UnifiedRuntimeState, 'schema' | 'queryId'>>,
): UnifiedRuntimeState {
  return {
    ...base,
    ...patch,
    schema: RUNTIME_UNIFIED_STATE_SCHEMA,
    queryId: base.queryId,
    artifactRefs: patch.artifactRefs ?? base.artifactRefs,
  };
}
