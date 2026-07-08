/**
 * Transitional adapter — CanonicalCausalTraceV1 → PlanningCausalChain nodes.
 * MUST NOT infer new effects; only projects existing CausalStoryView.
 */
import type { CausalStoryView } from '../../../causal-protocol/causal-story-view.types';
import type {
  PlanningCausalChainNode,
  PlanningCausalChainNodeSeverity,
} from '../types/planning-causal-chain.types';

function severityForType(type: CausalStoryView['chain'][0]['type']): PlanningCausalChainNodeSeverity {
  switch (type) {
    case 'CONFLICT':
      return 'risk';
    case 'IMPACT':
      return 'warn';
    case 'OPTION':
      return 'info';
    default:
      return 'info';
  }
}

function sourceForType(
  type: CausalStoryView['chain'][0]['type'],
): PlanningCausalChainNode['source'] {
  switch (type) {
    case 'CONFLICT':
      return 'problem_assertion';
    case 'OPTION':
      return 'option_preview';
    default:
      return 'world_context';
  }
}

export function projectCausalChainFromStoryView(story: CausalStoryView): PlanningCausalChainNode[] {
  return story.chain.map((node, index) => ({
    id: `story:${story.traceId}:${node.nodeId}`,
    order: index + 1,
    severity: severityForType(node.type),
    title: node.title,
    description: node.description,
    source: sourceForType(node.type),
    propagationHop: index + 1,
  }));
}
