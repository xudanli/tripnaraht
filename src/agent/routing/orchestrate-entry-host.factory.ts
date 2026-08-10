/**
 * OrchestrateEntryHost 工厂（从 ClaudeOrchestrator.asOrchestrateEntryHost 迁出）。
 */

import type { OrchestrateEntryHost } from './orchestrate-entry.host';

/** Service bridge：只依赖结构类型 */
export type OrchestrateEntryHostFactorySource = {
  logger: OrchestrateEntryHost['logger'];
  orchestrateItineraryDayViewQuery: OrchestrateEntryHost['runItineraryDayView'];
  orchestrateWorkbenchAssistantPlaceholder: OrchestrateEntryHost['runWorkbenchPlaceholder'];
  orchestrateLightweightKnowledgeQuery: OrchestrateEntryHost['runLightweightKnowledgeQuery'];
  orchestrateTeamStructuredDiscussionBypass: OrchestrateEntryHost['runTeamStructuredDiscussion'];
  orchestrateWithStateMachine: (
    request: Parameters<OrchestrateEntryHost['runPlanningStateMachine']>[0],
    context: Parameters<OrchestrateEntryHost['runPlanningStateMachine']>[1],
    deadline: Parameters<OrchestrateEntryHost['runPlanningStateMachine']>[2],
    unused?: undefined,
  ) => ReturnType<OrchestrateEntryHost['runPlanningStateMachine']>;
};

export function createOrchestrateEntryHost(
  svc: OrchestrateEntryHostFactorySource,
): OrchestrateEntryHost {
  return {
    logger: svc.logger,
    runItineraryDayView: (request, context, startTime) =>
      svc.orchestrateItineraryDayViewQuery(request, context, startTime),
    runWorkbenchPlaceholder: (request, context, startTime) =>
      svc.orchestrateWorkbenchAssistantPlaceholder(request, context, startTime),
    runLightweightKnowledgeQuery: (request, context, deadline, llmProvider, startTime) =>
      svc.orchestrateLightweightKnowledgeQuery(
        request,
        context,
        deadline,
        llmProvider,
        startTime,
      ),
    runTeamStructuredDiscussion: (request, context, userMessage, startTime) =>
      svc.orchestrateTeamStructuredDiscussionBypass(
        request,
        context,
        userMessage,
        startTime,
      ),
    runPlanningStateMachine: (request, context, smDeadline) =>
      svc.orchestrateWithStateMachine(request, context, smDeadline, undefined),
  };
}
