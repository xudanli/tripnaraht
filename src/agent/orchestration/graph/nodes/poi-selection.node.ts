import type { DecisionState } from '../../../../decision/kernel/decision-state.types';
import {
  BaseOrchestratorNode,
  type NodeExecutionContext,
  type NodeExecutionResult,
  type PoiSelectionPrePlanSegmentInput,
} from './base.node';
import type { PoiSelectionNodeHost, PoiSelectionPrePlanSegmentResult } from './poi-selection-node.host';
import { segmentOutcomeToNodeResult } from './node-outcome.adapter';
import { ensureHarnessResearchEvidenceSnapshot } from '../../../utils/harness-research-evidence-snapshot.util';

/**
 * pre_plan 子图 POI_SELECTION 节点（Phase 4b P0 第四项）。
 * 空间候选清洗/排序内聚于此；旁路工作区键在漏斗口熔断，不污染 DSO 顶层。
 */
export class PoiSelectionOrchestratorNode extends BaseOrchestratorNode {
  readonly nodeId = 'poi_selection' as const;

  constructor(private readonly host: PoiSelectionNodeHost) {
    super();
  }

  async execute(context: NodeExecutionContext): Promise<NodeExecutionResult> {
    const input = context as PoiSelectionPrePlanSegmentInput;
    if (!input.prePlan) {
      return {
        success: false,
        error: new Error('PoiSelectionOrchestratorNode requires prePlan segment control on context'),
      };
    }
    const segment = await runPoiSelectionPrePlanSegment(this.host, input);
    return segmentOutcomeToNodeResult(segment);
  }

  async runPrePlanSegment(
    input: PoiSelectionPrePlanSegmentInput,
  ): Promise<PoiSelectionPrePlanSegmentResult> {
    return runPoiSelectionPrePlanSegment(this.host, input);
  }
}

export async function runPoiSelectionPrePlanSegment(
  host: PoiSelectionNodeHost,
  input: PoiSelectionPrePlanSegmentInput,
): Promise<PoiSelectionPrePlanSegmentResult> {
  const { context, state, prePlan } = input;
  const startTime = prePlan.startTime;
  let decisionState = input.decisionState;

  const poiSelectionResult = await host.executePoiSelectionStep(state, decisionState);
  host.maybeSnapshot(state, 'AUTO');

  if (poiSelectionResult.allowWithFallback) {
    host.logger.debug('[Claude Orchestrator] POI_SELECTION 无数据，触发 FALLBACK');
    host.applyFallbackPlan(state);
    host.recordPoiPlanningOutcomeAfterItinerary(state, decisionState);
    state.current_step = 'DONE';
    state.metadata.last_updated_at = new Date().toISOString();
    state.metadata.total_duration_ms = Date.now() - startTime;
    host.maybeSnapshot(state, 'CHECKPOINT');
    return prePlan.prePlanTerminal(
      'terminal_done',
      host.buildSuccessResult(state, startTime, decisionState, context),
    );
  }

  if (poiSelectionResult.needsClarification) {
    host.logger.debug(
      '[Claude Orchestrator] POI_SELECTION 无同国家候选，返回 NEED_MORE_INFO',
    );
    host.maybeSnapshot(state, 'CHECKPOINT');
    return prePlan.prePlanTerminal(
      'terminal_clarification',
      host.buildClarificationResult(state, startTime, decisionState, context),
    );
  }

  const stop = prePlan.maybeStopAfter('poi_selection');
  if (stop) {
    return stop;
  }
  decisionState = ensureHarnessResearchEvidenceSnapshot(
    decisionState,
    state.request_id,
    state.research_data as Record<string, unknown> | undefined,
  );
  return { kind: 'continue', decisionState };
}
