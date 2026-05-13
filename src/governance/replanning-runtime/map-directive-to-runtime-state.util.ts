import type { RuntimeBranchDirective } from '../activation/runtime/runtime-branch-directive.types';
import type { GovernanceRuntimeState } from '../runtime-state-machine/governance-runtime-state.types';

export function mapDirectiveToRuntimeStateHint(d: RuntimeBranchDirective): GovernanceRuntimeState {
  switch (d.branchType) {
    case 'halted':
      return 'HALTED';
    case 'needs_confirmation':
      return 'BLOCKED';
    case 'replanning':
      return 'REPLANNING';
    default:
      return 'NORMAL';
  }
}
