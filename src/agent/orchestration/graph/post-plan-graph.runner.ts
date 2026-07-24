import { OrchestrationGraphScheduler } from './orchestration-graph.scheduler';
import { resolveMainChainNext } from './edges/main-chain.edges';
import { nodeResultToGraphNodeOutcome } from './nodes/node-outcome.adapter';
import { runPostPlanNarrateSegment } from '../post-plan/nodes/narrate.node';
import { runPostPlanFeedbackSegment } from '../post-plan/nodes/feedback.node';
import { runPostPlanHallucinationSegment } from '../post-plan/nodes/hallucination.node';
import type { PostPlanGraphHost } from '../post-plan/post-plan-graph.host';
import type {
  GraphNodeOutcome,
  GraphRunOutcome,
  OrchestrationGraphNodeHandler,
  SharedRunContext,
} from './orchestration-graph.types';

export type { PostPlanGraphHost } from '../post-plan/post-plan-graph.host';

function createPostPlanHandler(host: PostPlanGraphHost): OrchestrationGraphNodeHandler {
  return {
    async runNode(nodeId, ctx): Promise<GraphNodeOutcome> {
      switch (nodeId) {
        case 'narrate': {
          const narrateResult = await runPostPlanNarrateSegment(host, ctx);
          return nodeResultToGraphNodeOutcome(narrateResult);
        }
        case 'feedback': {
          const feedbackResult = await runPostPlanFeedbackSegment(host, ctx);
          return nodeResultToGraphNodeOutcome(feedbackResult);
        }
        case 'hallucination': {
          const hallucinationResult = await runPostPlanHallucinationSegment(host, ctx);
          return nodeResultToGraphNodeOutcome(hallucinationResult);
        }
        default:
          throw new Error(`post_plan graph: unsupported node ${nodeId}`);
      }
    },
  };
}

export async function runPostPlanGraph(
  host: PostPlanGraphHost,
  ctx: SharedRunContext,
): Promise<GraphRunOutcome> {
  const scheduler = new OrchestrationGraphScheduler();
  return scheduler.run(createPostPlanHandler(host), ctx, {
    entry: 'narrate',
    resolveNext: resolveMainChainNext,
    maxSteps: 6,
  });
}
