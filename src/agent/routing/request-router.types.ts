/**
 * RequestRouter 决策类型（不执行副作用）。
 *
 * - L1 Gateway：`OrchestrationPolicyDecision`（见 gateway-route-policy.util / facade）
 * - L2 Claude：本文件 `OrchestrateEntryDecision` + `StateMachineEntryRedirect`
 */

import type { TaskType } from '../utils/orchestration-signals.util';
import type { DecisionDepth } from '../../decision/kernel/decision-cognition.types';

export type RequestRouterTracePath =
  | 'LIGHTWEIGHT'
  | 'STATE_MACHINE'
  | 'CLAUDE_DYNAMIC'
  | 'TEAM_BYPASS';

export type { DecisionDepth };

/** 所有入口决策共用的认知深度字段 */
type WithDecisionDepth = { decisionDepth: DecisionDepth };

/** orchestrate() 入口决策 */
export type OrchestrateEntryDecision = WithDecisionDepth &
  (
    | {
        mode: 'LIGHTWEIGHT';
        handler: 'itinerary_day_view' | 'workbench_placeholder' | 'knowledge_query';
        reason: string;
        tracePath: 'LIGHTWEIGHT';
        /** TRIP_PLANNING 误标复盘时写回 options */
        patchOptions?: { intent_mode: 'DATA_LOOKUP'; use_state_machine_orchestration: false };
      }
    | {
        mode: 'PLANNING_STATE_MACHINE';
        reason: string;
        entry:
          | 'bound_trip_itinerary_adjust'
          | 'bound_trip_planning'
          | 'new_trip_with_country';
        tracePath: 'STATE_MACHINE';
        /** 新建行程状态机 deadline 建议（ms） */
        suggestedDeadlineMs?: number;
        countryCode?: string;
      }
    | {
        mode: 'TEAM_STRUCTURED_DISCUSSION';
        reason: string;
        tracePath: 'TEAM_BYPASS';
        userMessage: string;
      }
    | {
        mode: 'NEED_DESTINATION_COUNTRY';
        reason: string;
        tracePath: 'CLAUDE_DYNAMIC';
        /** 跨国区域等软澄清线索（如 ALPS） */
        regionCode?: string;
      }
    | {
        mode: 'DYNAMIC_DAG';
        reason: string;
        tracePath: 'CLAUDE_DYNAMIC';
      }
  );

/** CLAUDE_SM 入口是否应改走 Dynamic/轻量 */
export type StateMachineEntryRedirect =
  | { redirect: false; reason: string }
  | {
      redirect: true;
      to: 'CLAUDE_DYNAMIC_LIGHT' | 'WORKBENCH_PLACEHOLDER';
      reason: string;
      routingTaskType?: TaskType;
    };

export type ResolveOrchestrateEntryInput = {
  tripId?: string | null;
  /** 原始用户消息（day view / workbench / adjust 等） */
  message: string;
  /** resolveRouteAndRunUserMessage 结果；团队讨论优先用此字段 */
  resolvedUserMessage?: string;
  routingTaskType?: TaskType;
  /** 注入以便单测替换 */
  extractCountryCode?: (message: string) => string | undefined;
};
