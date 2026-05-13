import type { HydratedGovernanceRuntimeContext } from '../governance-activation.types';
import type { RuntimeBranchDirective } from './runtime-branch-directive.types';

export interface StructuredGovernanceRuntimeTraceV1 {
  schemaId: 'tripnara.governance_runtime.trace@v1';
  version: 1;
  governanceSnapshotId: string;
  activeActivationTypes: string[];
  selectedBranch: RuntimeBranchDirective['branchType'];
  unresolvedBlockCount: number;
  pressureSummary: {
    weather: number;
    world: number;
    policy: number;
    execution: number;
    recovery: number;
  };
}

export function buildStructuredGovernanceRuntimeTraceV1(args: {
  tripId: string;
  hydrated: HydratedGovernanceRuntimeContext;
  directive: RuntimeBranchDirective;
}): StructuredGovernanceRuntimeTraceV1 {
  const { tripId, hydrated, directive } = args;
  const p = hydrated.pressure;
  const weather = p.weather ?? p.worldPressure;
  const openBlocks = hydrated.snapshot.unresolvedBlocks.filter((b) => b.resolvedAt == null).length;
  return {
    schemaId: 'tripnara.governance_runtime.trace@v1',
    version: 1,
    governanceSnapshotId: `${tripId}:${hydrated.snapshot.compactedAt}`,
    activeActivationTypes: hydrated.activations.map((a) => a.activationType),
    selectedBranch: directive.branchType,
    unresolvedBlockCount: openBlocks,
    pressureSummary: {
      weather,
      world: p.worldPressure,
      policy: p.policyPressure,
      execution: p.executionPressure,
      recovery: p.recoveryPressure,
    },
  };
}
