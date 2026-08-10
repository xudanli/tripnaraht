/**
 * RequestRouter 入口分发：按 OrchestrateEntryDecision 调用 host，不执行编排实现体。
 */

import { setLlmTraceRoutePath } from '../../llm/token-context.storage';
import type { LlmProvider } from '../../llm/dto/llm-request.dto';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type {
  AgentContext,
  OrchestrationResult,
} from '../interfaces/claude-orchestration.interface';
import { createDeadline } from '../services/orchestration-stability.util';
import { buildNeedDestinationCountryResult } from './need-destination-country-result.util';
import type { OrchestrateEntryDecision } from './request-router.types';
import type {
  OrchestrateEntryDeadline,
  OrchestrateEntryHost,
} from './orchestrate-entry.host';

export type OrchestrateEntryDispatchOutcome =
  | { kind: 'terminal'; result: OrchestrationResult }
  | { kind: 'continue_dynamic' };

export type DispatchOrchestrateEntryInput = {
  entryDecision: OrchestrateEntryDecision;
  request: RouteAndRunRequestDto;
  context: AgentContext;
  deadline: OrchestrateEntryDeadline | undefined;
  llmProvider: LlmProvider;
  startTime: number;
  host: OrchestrateEntryHost;
};

/**
 * 分发 L2 入口决策。DYNAMIC_DAG 返回 continue_dynamic，由调用方继续 triage/skills。
 */
export async function dispatchOrchestrateEntry(
  input: DispatchOrchestrateEntryInput,
): Promise<OrchestrateEntryDispatchOutcome> {
  const { entryDecision, request, context, deadline, llmProvider, startTime, host } =
    input;

  if (entryDecision.mode === 'LIGHTWEIGHT') {
    if (entryDecision.patchOptions) {
      request.options = {
        ...request.options,
        ...entryDecision.patchOptions,
      };
    }
    setLlmTraceRoutePath(entryDecision.tracePath);
    if (entryDecision.handler === 'itinerary_day_view') {
      host.logger.log(
        `[Claude Orchestrator] 查看指定日行程 → 读库短路 request_id=${request.request_id}`,
      );
      return {
        kind: 'terminal',
        result: await host.runItineraryDayView(request, context, startTime),
      };
    }
    if (entryDecision.handler === 'workbench_placeholder') {
      host.logger.log(
        `[Claude Orchestrator] 工作台助手占位欢迎语 → 短路 request_id=${request.request_id}`,
      );
      return {
        kind: 'terminal',
        result: await host.runWorkbenchPlaceholder(request, context, startTime),
      };
    }
    host.logger.log(
      `[Claude Orchestrator] RequestRouter → 轻量知识问答 (${entryDecision.reason}) request_id=${request.request_id}`,
    );
    return {
      kind: 'terminal',
      result: await host.runLightweightKnowledgeQuery(
        request,
        context,
        deadline,
        llmProvider,
        startTime,
      ),
    };
  }

  if (entryDecision.mode === 'TEAM_STRUCTURED_DISCUSSION') {
    host.logger.warn(
      `[Claude Orchestrator] TEAM_STRUCTURED_DISCUSSION bypass QA_LIGHT request_id=${request.request_id}`,
    );
    return {
      kind: 'terminal',
      result: await host.runTeamStructuredDiscussion(
        request,
        context,
        entryDecision.userMessage,
        startTime,
      ),
    };
  }

  if (entryDecision.mode === 'PLANNING_STATE_MACHINE') {
    host.logger.log(
      `[Claude Orchestrator] RequestRouter → 状态机 entry=${entryDecision.entry} reason=${entryDecision.reason} request_id=${request.request_id}`,
    );
    setLlmTraceRoutePath(entryDecision.tracePath);
    const smDeadline =
      deadline ?? createDeadline(entryDecision.suggestedDeadlineMs ?? 120_000);
    const smResult = await host.runPlanningStateMachine(request, context, smDeadline);
    smResult.totalDuration = Date.now() - startTime;
    return { kind: 'terminal', result: smResult };
  }

  if (entryDecision.mode === 'NEED_DESTINATION_COUNTRY') {
    host.logger.warn(
      `[Claude Orchestrator] 创建新行程需要目的地信息，但无法从消息中提取 countryCode`,
    );
    return {
      kind: 'terminal',
      result: buildNeedDestinationCountryResult({
        request,
        entryDecision,
        startTime,
      }),
    };
  }

  // DYNAMIC_DAG
  return { kind: 'continue_dynamic' };
}
