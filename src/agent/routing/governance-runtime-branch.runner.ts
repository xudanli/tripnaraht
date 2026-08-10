/**
 * 合并 Governance runtime branch directive 到 DSO（从 ClaudeOrchestrator 迁出）。
 */

import type { GovernanceRuntimeBranchHost } from './governance-runtime-branch.host';
import type { DecisionState } from '../../decision/kernel/decision-state.types';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { RuntimeBranchDirective } from '../../governance/activation/runtime/runtime-branch-directive.types';

export function mergeGovernanceRuntimeBranchDirective(
  host: GovernanceRuntimeBranchHost,
  request: RouteAndRunRequestDto,
  decisionState: DecisionState | undefined,
): DecisionState | undefined {
  if (!host.decisionKernel || !decisionState) return decisionState;
  const dir = (request as { __runtimeBranchDirective?: RuntimeBranchDirective })
    .__runtimeBranchDirective;
  if (!dir || dir.branchType === 'normal_execution') return decisionState;
  const intent = dir.replanningIntent;
  return host.decisionKernel.updateState(decisionState, {
    harnessRuntime: {
      ...(decisionState.harnessRuntime ?? {}),
      governance_runtime_branch_v1: {
        branchType: dir.branchType,
        sourceActivationIds: dir.sourceActivationIds,
        ...(intent
          ? {
              replanningIntent: {
                trigger: intent.trigger,
                requiredActions: intent.requiredActions,
                preservedConstraints: intent.preservedConstraints,
                forbiddenStrategies: intent.forbiddenStrategies,
                replanningScope: intent.replanningScope,
              },
            }
          : {}),
      },
    },
  });
}
