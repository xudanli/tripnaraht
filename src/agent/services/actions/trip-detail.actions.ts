// src/agent/services/actions/trip-detail.actions.ts
/**
 * Trip Detail Actions
 * 
 * 让统一入口可以调用行程详情页 Agent
 */

import { Action, ActionKind, ActionCost, ActionSideEffect } from '../../interfaces/action.interface';
import { TripDetailAgentService, TripDetailAgentRequest } from '../trip-detail-agent.service';

export function createTripDetailActions(
  tripDetailAgent: TripDetailAgentService
): Action[] {
  return [
    {
      name: 'trip.detail.get_status',
      description: '理解当前行程状态（规划中/进行中/已完成）',
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
        },
        required: ['tripId'],
      },
      output_schema: {
        type: 'object',
        properties: {
          status: { type: 'object' },
        },
      },
      execute: async (input: any, state: any) => {
        const request: TripDetailAgentRequest = {
          tripId: input.tripId || state.trip?.trip_id,
          action: 'get_status',
        };
        
        const result = await tripDetailAgent.execute(request);
        return result.uiOutput;
      },
    },
    {
      name: 'trip.detail.get_health',
      description: '分析行程健康度（时间、预算、节奏、可达性）',
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
        },
        required: ['tripId'],
      },
      output_schema: {
        type: 'object',
        properties: {
          health: { type: 'object' },
        },
      },
      execute: async (input: any, state: any) => {
        const request: TripDetailAgentRequest = {
          tripId: input.tripId || state.trip?.trip_id,
          action: 'get_health',
        };
        
        const result = await tripDetailAgent.execute(request);
        return result.uiOutput;
      },
    },
    {
      name: 'trip.detail.explain_decisions',
      description: '解释决策（基于决策日志）',
      metadata: {
        kind: ActionKind.INTERNAL,
        cost: ActionCost.MEDIUM,
        side_effect: ActionSideEffect.NONE,
        preconditions: ['trip.trip_id'],
        idempotent: true,
        cacheable: true,
      },
      input_schema: {
        type: 'object',
        properties: {
          tripId: { type: 'string' },
          decisionId: { type: 'string' },
        },
        required: ['tripId'],
      },
      output_schema: {
        type: 'object',
        properties: {
          explanations: { type: 'array' },
        },
      },
      execute: async (input: any, state: any) => {
        const request: TripDetailAgentRequest = {
          tripId: input.tripId || state.trip?.trip_id,
          action: 'explain_decisions',
          decisionId: input.decisionId,
        };
        
        const result = await tripDetailAgent.execute(request);
        return result.uiOutput;
      },
    },
  ];
}
