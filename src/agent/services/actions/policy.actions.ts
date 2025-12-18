// src/agent/services/actions/policy.actions.ts
import { Action, ActionKind, ActionCost, ActionSideEffect } from '../../interfaces/action.interface';
import { FeasibilityService } from '../../../planning-policy/services/feasibility.service';
import { PlanningPolicy } from '../../../planning-policy/interfaces/planning-policy.interface';

/**
 * Policy Actions
 */
export function createPolicyActions(
  feasibilityService: FeasibilityService
): Action[] {
  return [
    {
      name: 'policy.validate_feasibility',
      description: '验证行程的可行性（时间窗、日界、午餐等）',
      metadata: {
        kind: ActionKind.INTERNAL,
        cost: ActionCost.LOW,
        side_effect: ActionSideEffect.NONE,
        preconditions: ['result.timeline'],
        idempotent: true,
        cacheable: true,
      },
      input_schema: {
        type: 'object',
        properties: {
          timeline: { type: 'array' },
          policy: { type: 'object' },
        },
        required: ['timeline'],
      },
      output_schema: {
        type: 'object',
        properties: {
          pass: { type: 'boolean' },
          violations: { type: 'array' },
        },
      },
      execute: async (
        input: {
          timeline: any[];
          policy?: PlanningPolicy;
        },
        state: any
      ): Promise<{
        pass: boolean;
        violations: Array<{
          type: string;
          message: string;
          node_id?: number;
          details?: any;
        }>;
      }> => {
        // 辅助函数：解析时间字符串（HH:mm）为分钟数
        const parseTime = (timeStr: string): number => {
          const [hours, minutes] = timeStr.split(':').map(Number);
          return hours * 60 + minutes;
        };

        try {
          const violations: Array<{
            type: string;
            message: string;
            node_id?: number;
            details?: any;
          }> = [];

          const timeline = input.timeline || [];
          const policy = input.policy || (state.memory?.user_profile?.policy as PlanningPolicy);

          // 检查时间窗
          for (const event of timeline) {
            if (event.type === 'NODE' && event.node_id) {
              // 这里应该调用 FeasibilityService.isPoiFeasible()
              // 简化实现：检查基本约束
              if (event.wait_min && event.wait_min > 60) {
                violations.push({
                  type: 'HIGH_WAIT_TIME',
                  message: `节点 ${event.node_id} 等待时间过长：${event.wait_min} 分钟`,
                  node_id: event.node_id,
                  details: { wait_min: event.wait_min },
                });
              }
            }
          }

          // 检查日界
          const dayBoundary = state.trip.day_boundaries?.[0];
          if (dayBoundary && timeline.length > 0) {
            const lastEvent = timeline[timeline.length - 1];
            const endTime = parseTime(lastEvent.end || lastEvent.start);
            const dayEnd = parseTime(dayBoundary.end);

            if (endTime > dayEnd) {
              violations.push({
                type: 'DAY_BOUNDARY_VIOLATION',
                message: `行程结束时间 ${lastEvent.end} 超过了日界 ${dayBoundary.end}`,
                details: { endTime: lastEvent.end, dayEnd: dayBoundary.end },
              });
            }
          }

          // 检查午餐锚点
          const lunchBreak = state.trip.lunch_break;
          if (lunchBreak?.enabled) {
            const lunchEvents = timeline.filter((e: any) => e.type === 'LUNCH');

            if (lunchEvents.length === 0) {
              violations.push({
                type: 'LUNCH_MISSING',
                message: '缺少午餐休息时间',
              });
            } else if (lunchEvents.length > 1) {
              violations.push({
                type: 'LUNCH_MULTIPLE',
                message: `午餐休息时间过多：${lunchEvents.length} 个`,
              });
            } else {
              const lunch = lunchEvents[0];
              const lunchStart = parseTime(lunch.start);
              const windowStart = parseTime(lunchBreak.window[0]);
              const windowEnd = parseTime(lunchBreak.window[1]);

              if (lunchStart < windowStart || lunchStart > windowEnd) {
                violations.push({
                  type: 'LUNCH_WINDOW_VIOLATION',
                  message: `午餐时间 ${lunch.start} 不在窗口 [${lunchBreak.window[0]}, ${lunchBreak.window[1]}] 内`,
                  details: { lunchTime: lunch.start, window: lunchBreak.window },
                });
              }
            }
          }

          return {
            pass: violations.length === 0,
            violations,
          };
        } catch (error: any) {
          throw new Error(`可行性验证失败: ${error?.message || String(error)}`);
        }
      },
    },
    {
      name: 'policy.score_robustness',
      description: '评估行程的稳健度',
      metadata: {
        kind: ActionKind.INTERNAL,
        cost: ActionCost.LOW,
        side_effect: ActionSideEffect.NONE,
        preconditions: ['result.timeline'],
        idempotent: true,
        cacheable: true,
      },
      input_schema: {
        type: 'object',
        properties: {
          timeline: { type: 'array' },
        },
        required: ['timeline'],
      },
      output_schema: {
        type: 'object',
        properties: {
          score: { type: 'number' },
          metrics: { type: 'object' },
        },
      },
      execute: async (
        input: { timeline: any[] },
        state: any
      ): Promise<{
        score: number;
        metrics: any;
      }> => {
        try {
          const timeline = input.timeline || [];
          
          // 计算稳健度指标
          let totalWait = 0;
          let minSlack = Infinity;
          
          for (const event of timeline) {
            if (event.wait_min) {
              totalWait += event.wait_min;
            }
            if (event.slack_min !== undefined) {
              minSlack = Math.min(minSlack, event.slack_min);
            }
          }

          // 计算稳健度分数（0-1，越高越好）
          // 简化实现：基于等待时间和松弛时间
          const waitScore = Math.max(0, 1 - totalWait / 120); // 等待时间越少越好
          const slackScore = Math.min(1, minSlack / 30); // 松弛时间越多越好
          const score = (waitScore + slackScore) / 2;

          return {
            score,
            metrics: {
              total_wait_minutes: totalWait,
              min_slack_minutes: minSlack === Infinity ? undefined : minSlack,
            },
          };
        } catch (error: any) {
          throw new Error(`稳健度评估失败: ${error?.message || String(error)}`);
        }
      },
    },
  ];
}

