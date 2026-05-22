import type { GraphNodeOutcome, GraphRunOutcome } from '../orchestration-graph.types';
import type { NodeExecutionResult } from './base.node';

export function nodeResultToGraphNodeOutcome(result: NodeExecutionResult): GraphNodeOutcome {
  if (!result.success) {
    if ('graphOutcome' in result && result.graphOutcome) return result.graphOutcome;
    return { kind: 'continue', decisionState: result.decisionState };
  }
  return {
    kind: 'continue',
    decisionState: result.decisionState,
    ...(result.nextAnchorOverride ? { next: result.nextAnchorOverride } : {}),
  };
}

export function segmentOutcomeToNodeResult(
  segment: GraphRunOutcome | { kind: 'continue'; decisionState?: import('../../../../decision/kernel/decision-state.types').DecisionState },
): NodeExecutionResult {
  if (segment.kind === 'continue') {
    return { success: true, decisionState: segment.decisionState };
  }
  if (segment.kind === 'terminal') {
    return {
      success: false,
      graphOutcome: segment,
      decisionState: segment.decisionState,
      error: new Error(`terminal:${segment.terminal}`),
    };
  }
  if (segment.kind === 'completed') {
    return { success: true, decisionState: segment.decisionState };
  }
  return {
    success: true,
    decisionState: segment.decisionState,
    nextAnchorOverride: segment.to,
  };
}
