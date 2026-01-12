// src/agent/services/actions/planning.actions.ts
/**
 * Planning Actions
 * 
 * 让统一入口可以调用规划工作台 Agent
 */

import { Action, ActionKind, ActionCost, ActionSideEffect } from '../../interfaces/action.interface';
import { PlanningWorkbenchAgentService, PlanningWorkbenchRequest } from '../planning-workbench-agent.service';

export function createPlanningActions(
  planningWorkbenchAgent: PlanningWorkbenchAgentService
): Action[] {
  return [
    {
      name: 'planning.workbench.generate',
      description: '生成行程骨架方案（规划工作台）',
      metadata: {
        kind: ActionKind.INTERNAL,
        cost: ActionCost.MEDIUM,
        side_effect: ActionSideEffect.NONE,
        preconditions: ['planning.context'],
        idempotent: false,
        cacheable: false,
      },
      input_schema: {
        type: 'object',
        properties: {
          context: {
            type: 'object',
            properties: {
              destination: { type: 'object' },
              days: { type: 'number' },
              travelMode: { type: 'string' },
              constraints: { type: 'object' },
            },
            required: ['destination', 'days'],
          },
          tripId: { type: 'string' },
          userAction: { type: 'string', enum: ['generate', 'compare', 'commit', 'adjust'] },
        },
        required: ['context'],
      },
      output_schema: {
        type: 'object',
        properties: {
          planState: { type: 'object' },
          uiOutput: {
            type: 'object',
            properties: {
              personas: { type: 'object' },
              consolidatedDecision: { type: 'object' },
            },
          },
        },
      },
      execute: async (input: any, state: any) => {
        const request: PlanningWorkbenchRequest = {
          context: input.context,
          tripId: input.tripId || state.trip?.trip_id,
          userAction: input.userAction || 'generate',
        };
        
        const result = await planningWorkbenchAgent.execute(request);
        return result;
      },
    },
    {
      name: 'planning.workbench.compare',
      description: '对比多个行程骨架方案',
      metadata: {
        kind: ActionKind.INTERNAL,
        cost: ActionCost.MEDIUM,
        side_effect: ActionSideEffect.NONE,
        preconditions: ['planning.options'],
        idempotent: false,
        cacheable: false,
      },
      input_schema: {
        type: 'object',
        properties: {
          options: { type: 'array' },
          context: { type: 'object' },
        },
        required: ['options'],
      },
      output_schema: {
        type: 'object',
        properties: {
          comparison: { type: 'object' },
        },
      },
      execute: async (input: any, state: any) => {
        const request: PlanningWorkbenchRequest = {
          context: input.context || {},
          tripId: state.trip?.trip_id,
          userAction: 'compare',
        };
        
        const result = await planningWorkbenchAgent.execute(request);
        return result;
      },
    },
  ];
}
