// src/agent/services/actions/itinerary.actions.ts
import { Action, ActionKind, ActionCost, ActionSideEffect } from '../../interfaces/action.interface';
import { EnhancedVRPTWOptimizerService } from '../../../itinerary-optimization/services/enhanced-vrptw-optimizer.service';
import { PlanRequest, PlanNode, OptimizationResult } from '../../../itinerary-optimization/interfaces/plan-request.interface';

/**
 * Itinerary Actions
 */
export function createItineraryActions(
  vrptwOptimizer: EnhancedVRPTWOptimizerService
): Action[] {
  return [
    {
      name: 'itinerary.optimize_day_vrptw',
      description: '使用 VRPTW 算法优化单日行程',
      metadata: {
        kind: ActionKind.INTERNAL,
        cost: ActionCost.HIGH,
        side_effect: ActionSideEffect.NONE,
        preconditions: ['draft.nodes', 'compute.time_matrix_robust'],
        idempotent: true,
        cacheable: false, // 优化结果可能因状态变化而不同
      },
      input_schema: {
        type: 'object',
        properties: {
          nodes: { type: 'array' },
          time_matrix: { type: 'array', items: { type: 'array', items: { type: 'number' } } },
          trip: { type: 'object' },
        },
        required: ['nodes', 'time_matrix'],
      },
      output_schema: {
        type: 'object',
        properties: {
          results: { type: 'array' },
          timeline: { type: 'array' },
          dropped_items: { type: 'array' },
        },
      },
      execute: async (
        input: {
          nodes: any[];
          time_matrix: number[][];
          trip?: any;
        },
        state: any
      ): Promise<{
        results: OptimizationResult[];
        timeline: any[];
        dropped_items: any[];
      }> => {
        try {
          // 转换节点格式为 PlanNode
          const planNodes: PlanNode[] = input.nodes.map((node: any, index: number) => ({
            id: node.id,
            name: node.name || `Node ${index + 1}`,
            type: node.type || 'poi',
            service_duration_min: node.service_duration_min || 60,
            time_windows: node.time_windows || undefined,
            constraints: {
              is_hard_node: node.constraints?.is_hard_node || false,
              priority_level: node.constraints?.priority_level || 3,
              drop_penalty: node.constraints?.drop_penalty,
            },
            geo: node.geo,
            meta: node.meta,
          }));

          // 构建 PlanRequest
          const trip = input.trip || state.trip;
          const dayBoundary = trip.day_boundaries?.[0] || { start: '10:00', end: '22:00' };

          const planRequest: PlanRequest = {
            date: new Date().toISOString().split('T')[0], // 今天
            timezone: 'Asia/Shanghai', // 默认时区
            day_boundary: {
              start: dayBoundary.start,
              end: dayBoundary.end,
            },
            start: {
              node_id: planNodes[0]?.id || 0,
              name: planNodes[0]?.name || 'Start',
              geo: planNodes[0]?.geo || { lat: 0, lng: 0 },
            },
            end: {
              node_id: planNodes[planNodes.length - 1]?.id || 0,
              same_as_start: false,
              name: planNodes[planNodes.length - 1]?.name || 'End',
              geo: planNodes[planNodes.length - 1]?.geo || { lat: 0, lng: 0 },
            },
            nodes: planNodes,
            transport_policy: {
              buffer_factor: 1.2,
              fixed_buffer_min: 15,
            },
            lifestyle_policy: {
              lunch_break: trip.lunch_break || {
                enabled: true,
                duration_min: 60,
                window: ['11:30', '13:30'],
              },
            },
            pacing: trip.pacing || 'normal',
          };

          // 调用优化器
          const result: OptimizationResult = await vrptwOptimizer.solve(planRequest);

          // 转换结果为 AgentState 格式
          const timeline = result.timeline || [];
          const droppedItems = result.dropped.map((d) => ({
            id: d.node_id,
            name: d.name,
            reason_code: d.reason_code,
            facts: d.explanation.facts,
            explanation: d.explanation.text,
          }));

          return {
            results: [result],
            timeline,
            dropped_items: droppedItems,
          };
        } catch (error: any) {
          throw new Error(`行程优化失败: ${error?.message || String(error)}`);
        }
      },
    },
    {
      name: 'itinerary.repair_cross_day',
      description: '修复跨天问题（交换节点顺序、移动节点等）',
      metadata: {
        kind: ActionKind.INTERNAL,
        cost: ActionCost.MEDIUM,
        side_effect: ActionSideEffect.NONE,
        preconditions: ['result.timeline'],
        idempotent: false,
        cacheable: false,
      },
      input_schema: {
        type: 'object',
        properties: {
          violations: { type: 'array' },
        },
        required: ['violations'],
      },
      output_schema: {
        type: 'object',
        properties: {
          repaired: { type: 'boolean' },
          timeline: { type: 'array' },
        },
      },
      execute: async (
        input: { violations: any[] },
        state: any
      ): Promise<{
        repaired: boolean;
        timeline: any[];
      }> => {
        try {
          // 简化实现：尝试调整顺序
          // 实际应该根据 violations 类型选择修复策略
          const timeline = state.result.timeline || [];

          // 如果时间窗冲突，尝试交换相邻节点
          const timeWindowViolations = input.violations.filter(
            (v: any) => v.type === 'TIME_WINDOW_CONFLICT'
          );

          if (timeWindowViolations.length > 0) {
            // 简单的修复：交换前两个节点（实际应该更智能）
            if (timeline.length >= 2) {
              const newTimeline = [...timeline];
              [newTimeline[0], newTimeline[1]] = [newTimeline[1], newTimeline[0]];
              return {
                repaired: true,
                timeline: newTimeline,
              };
            }
          }

          return {
            repaired: false,
            timeline,
          };
        } catch (error: any) {
          throw new Error(`修复失败: ${error?.message || String(error)}`);
        }
      },
    },
  ];
}

