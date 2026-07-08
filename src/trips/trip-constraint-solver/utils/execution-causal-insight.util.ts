import type { CausalStoryView } from '../../../causal-protocol/causal-story-view.types';
import type { ConstraintEnforcement } from '../../decision-semantics/types/decision-semantics.types';
import type {
  ExecutionCausalInsightDto,
  ExecutionCausalPrimaryEnforcement,
} from '../types/trip-constraint-solver.types';

export function mapEnforcementToExecutionCausal(
  enforcement?: ConstraintEnforcement | string,
): ExecutionCausalPrimaryEnforcement {
  if (enforcement === 'BLOCK') return 'NOT_EXECUTABLE';
  return 'ADJUST_REQUIRED';
}

export function projectExecutionCausalInsight(input: {
  guardianStory: CausalStoryView;
  neutralStory: CausalStoryView;
  primaryEnforcement?: ConstraintEnforcement | string;
  linkedProblemId?: string;
}): ExecutionCausalInsightDto {
  return {
    guardianHeadline: input.guardianStory.headline,
    primaryEnforcement: mapEnforcementToExecutionCausal(input.primaryEnforcement),
    causalStory: {
      chain: input.neutralStory.chain.map((node) => ({
        nodeId: node.nodeId,
        type: node.type,
        title: node.title,
        description: node.description,
        ...(node.sourceRefs?.length ? { sourceRefs: node.sourceRefs } : {}),
      })),
      assessment: input.neutralStory.assessment,
    },
    ...(input.linkedProblemId ? { linkedProblemId: input.linkedProblemId } : {}),
  };
}
