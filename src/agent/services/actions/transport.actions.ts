// src/agent/services/actions/transport.actions.ts
import { Action, ActionKind, ActionCost, ActionSideEffect } from '../../interfaces/action.interface';
import { TransportRoutingService } from '../../../transport/transport-routing.service';

/**
 * Transport Actions
 */
export function createTransportActions(
  transportRoutingService: TransportRoutingService
): Action[] {
  return [
    {
      name: 'transport.build_time_matrix',
      description: '构建时间矩阵（所有点对之间的旅行时间）',
      metadata: {
        kind: ActionKind.INTERNAL,
        cost: ActionCost.MEDIUM,
        side_effect: ActionSideEffect.CALLS_API,
        preconditions: ['draft.nodes'],
        idempotent: true,
        cacheable: true,
      },
      input_schema: {
        type: 'object',
        properties: {
          nodes: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'number' },
                geo: {
                  type: 'object',
                  properties: {
                    lat: { type: 'number' },
                    lng: { type: 'number' },
                  },
                },
              },
            },
          },
        },
        required: ['nodes'],
      },
      output_schema: {
        type: 'object',
        properties: {
          time_matrix_api: { type: 'array', items: { type: 'array', items: { type: 'number' } } },
          time_matrix_robust: { type: 'array', items: { type: 'array', items: { type: 'number' } } },
        },
      },
      execute: async (input: { nodes: Array<{ id: number; geo: { lat: number; lng: number } }> }, state: any) => {
        try {
          const n = input.nodes.length;
          const timeMatrixApi: number[][] = [];
          const timeMatrixRobust: number[][] = [];

          // 构建用户上下文（简化版）
          const userContext = {
            budgetSensitivity: 'MEDIUM' as const,
            timeSensitivity: 'MEDIUM' as const,
            hasLuggage: false,
            hasElderly: false,
            isMovingDay: false,
            isRaining: false,
            hasLimitedMobility: false,
          };

          // 计算所有点对之间的时间
          for (let i = 0; i < n; i++) {
            const rowApi: number[] = [];
            const rowRobust: number[] = [];

            for (let j = 0; j < n; j++) {
              if (i === j) {
                rowApi.push(0);
                rowRobust.push(0);
              } else {
                const from = input.nodes[i];
                const to = input.nodes[j];

                try {
                  // 调用交通规划服务
                  const recommendation = await transportRoutingService.planRoute(
                    from.geo.lat,
                    from.geo.lng,
                    to.geo.lat,
                    to.geo.lng,
                    userContext
                  );

                  // 获取最佳选项的时长
                  const bestOption = recommendation.options[0];
                  const apiTime = bestOption?.durationMinutes || 30; // 默认 30 分钟

                  // 计算鲁棒时间（添加缓冲）
                  const bufferFactor = 1.2;
                  const fixedBuffer = 15;
                  const robustTime = Math.round(apiTime * bufferFactor + fixedBuffer);

                  rowApi.push(apiTime);
                  rowRobust.push(robustTime);
                } catch (error: any) {
                  // 如果计算失败，使用估算值
                  // 注意：这通常发生在 Google Routes API 不可用时（如 403 错误）
                  const estimatedTime = 30;
                  rowApi.push(estimatedTime);
                  rowRobust.push(Math.round(estimatedTime * 1.2 + 15));
                }
              }
            }

            timeMatrixApi.push(rowApi);
            timeMatrixRobust.push(rowRobust);
          }

          return {
            time_matrix_api: timeMatrixApi,
            time_matrix_robust: timeMatrixRobust,
          };
        } catch (error: any) {
          throw new Error(`构建时间矩阵失败: ${error?.message || String(error)}`);
        }
      },
    },
  ];
}

