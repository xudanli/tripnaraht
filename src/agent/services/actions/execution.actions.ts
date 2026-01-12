// src/agent/services/actions/execution.actions.ts
/**
 * Execution Actions
 * 
 * 让统一入口可以调用执行阶段 Agent
 */

import { Action, ActionKind, ActionCost, ActionSideEffect } from '../../interfaces/action.interface';
import { ExecutionAgentService, ExecutionAgentRequest } from '../execution-agent.service';

export function createExecutionActions(
  executionAgent: ExecutionAgentService
): Action[] {
  return [
    {
      name: 'execution.remind',
      description: '生成执行阶段的提醒（出发、入住、活动、交通、天气、安全、预算）',
      metadata: {
        kind: ActionKind.INTERNAL,
        cost: ActionCost.LOW,
        side_effect: ActionSideEffect.NONE,
        preconditions: ['trip.trip_id'],
        idempotent: true,
        cacheable: true,
      },
      input_schema: {
        type: 'object',
        properties: {
          tripId: { type: 'string' },
          reminderTypes: { type: 'array', items: { type: 'string' } },
          advanceHours: { type: 'number' },
        },
        required: ['tripId'],
      },
      output_schema: {
        type: 'object',
        properties: {
          reminders: { type: 'array' },
        },
      },
      execute: async (input: any, state: any) => {
        const request: ExecutionAgentRequest = {
          tripId: input.tripId || state.trip?.trip_id,
          action: 'remind',
          remindParams: {
            reminderTypes: input.reminderTypes,
            advanceHours: input.advanceHours,
          },
        };
        
        const result = await executionAgent.execute(request);
        return result.uiOutput;
      },
    },
    {
      name: 'execution.handle_change',
      description: '处理执行期间的变更（时间、地点、活动取消、交通延误等）',
      metadata: {
        kind: ActionKind.INTERNAL,
        cost: ActionCost.MEDIUM,
        side_effect: ActionSideEffect.WRITES_DB,
        preconditions: ['trip.trip_id', 'execution.change'],
        idempotent: false,
        cacheable: false,
      },
      input_schema: {
        type: 'object',
        properties: {
          tripId: { type: 'string' },
          changeType: { type: 'string' },
          changeDetails: { type: 'object' },
        },
        required: ['tripId', 'changeType', 'changeDetails'],
      },
      output_schema: {
        type: 'object',
        properties: {
          changeResult: { type: 'object' },
        },
      },
      execute: async (input: any, state: any) => {
        const request: ExecutionAgentRequest = {
          tripId: input.tripId || state.trip?.trip_id,
          action: 'handle_change',
          changeParams: {
            changeType: input.changeType,
            changeDetails: input.changeDetails,
          },
        };
        
        const result = await executionAgent.execute(request);
        return result.uiOutput;
      },
    },
  ];
}
