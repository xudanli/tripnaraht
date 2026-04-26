// src/agent/services/actions/trip.actions.ts
import { Action, ActionKind, ActionCost, ActionSideEffect } from '../../interfaces/action.interface';
import { TripsService } from '../../../trips/trips.service';
import { ItineraryItemsService } from '../../../itinerary-items/itinerary-items.service';
import { DayScheduleResult } from '../../../planning-policy/interfaces/scheduler.interface';
import { DateTime } from 'luxon';
import { BadRequestException } from '@nestjs/common';

type UnknownRecord = Record<string, unknown>;

/**
 * Pick the first non-empty string from candidates
 * Handles null, undefined, empty strings, and non-string values
 */
function pickTripId(...candidates: Array<unknown>): string | undefined {
  for (const c of candidates) {
    // Skip null, undefined, and non-string values
    if (c === null || c === undefined) {
      continue;
    }
    // Convert to string and check if non-empty after trim
    const str = String(c).trim();
    if (str.length > 0) {
      return str;
    }
  }
  return undefined;
}

/**
 * Trip Actions
 * 
 * 示例：如何将现有服务注册为 Actions
 */
export function createTripActions(
  tripsService: TripsService,
  itineraryItemsService?: ItineraryItemsService
): Action[] {
  return [
    {
      name: 'trip.load_draft',
      description: '加载行程草稿',
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
          trip_id: { type: 'string' },
        },
        required: ['trip_id'],
      },
      output_schema: {
        type: 'object',
        properties: {
          trip: { type: 'object' },
          items: { type: 'array' },
        },
      },
      execute: async (input: { trip_id?: string; tripId?: string }, state: any) => {
        // Extract tripId from multiple sources (in priority order)
        const inputRecord = (input ?? {}) as UnknownRecord;
        const stateRecord = (state ?? {}) as UnknownRecord;
        const tripRecord = (stateRecord.trip ?? {}) as UnknownRecord;
        
        // Try to get tripId from:
        // 1. input.trip_id or input.tripId (direct argument)
        // 2. state.trip.trip_id (from agent state)
        // 3. state.tripId (alternative state location)
        const tripId = pickTripId(
          inputRecord.trip_id,
          inputRecord.tripId,
          tripRecord.trip_id,
          stateRecord.tripId,
        );
        
        // Validate tripId before calling service
        if (!tripId) {
          const errorMsg = `tripId is required for trip.load_draft. 
Available sources:
- input.trip_id: ${inputRecord.trip_id}
- input.tripId: ${inputRecord.tripId}
- state.trip.trip_id: ${tripRecord.trip_id}
- state.tripId: ${stateRecord.tripId}
Please provide args.trip_id or ensure it is stored in agent state.`;
          throw new BadRequestException(errorMsg);
        }
        
        // Double-check: ensure tripId is a valid non-empty string
        if (typeof tripId !== 'string' || !tripId.trim()) {
          throw new BadRequestException(`Invalid tripId: expected non-empty string, got ${typeof tripId}: ${tripId}`);
        }
        
        // 调用实际的 TripsService
        const trip = await tripsService.findOne(tripId.trim());
        
        // 从 trip.days 中提取所有的 items，展平为一个数组
        const items: any[] = [];
        if (trip.days && Array.isArray(trip.days)) {
          for (const day of trip.days) {
            if (day.items && Array.isArray(day.items)) {
              items.push(...day.items);
            }
          }
        }
        
        // 返回格式化的结果
        return {
          trip,
          items, // 已加载 itinerary items
          tripId, // 返回 tripId 以便后续使用
        };
      },
    },
    {
      name: 'trip.apply_user_edit',
      description: '应用用户编辑（仅当已有完整的编辑信息时使用，包括 placeId、tripDayId、startTime、endTime 等。如果用户只是说"添加地点X"但没有提供完整信息，应该先使用 places.resolve_entities）',
      metadata: {
        kind: ActionKind.INTERNAL,
        cost: ActionCost.LOW,
        side_effect: ActionSideEffect.WRITES_DB,
        preconditions: ['trip.trip_id'],
        idempotent: false,
        cacheable: false,
      },
      // Admin “策略实验室”底稿（3-tier merged view 的第 1 层）：声明该 Action 可能触发的副作用及其默认参数。
      // Runtime will merge DB / file overrides via SideEffectParamResolverService.
      side_effect_configs: [
        {
          handlerId: 'side_effect.financial_hold.book_flight_v1',
          params: { ttl_seconds: 900, hold_ratio: 1.0 },
        },
      ],
      input_schema: {
        type: 'object',
        properties: {
          trip_id: { 
            type: 'string',
            description: '行程ID（字符串）',
          },
          edits: { 
            type: 'array',
            description: '编辑操作数组，不能为空',
            items: {
              type: 'object',
              properties: {
                type: {
                  type: 'string',
                  enum: ['add', 'update', 'delete', 'move'],
                  description: '编辑类型',
                },
                itemId: {
                  type: 'string',
                  description: '行程项ID（update/delete/move时需要）',
                },
                placeId: {
                  type: 'number',
                  description: '地点ID（add时需要）',
                },
                tripDayId: {
                  type: 'string',
                  description: '日期ID（add时需要）',
                },
                startTime: {
                  type: 'string',
                  description: '开始时间（ISO字符串，add/update/move时需要）',
                },
                endTime: {
                  type: 'string',
                  description: '结束时间（ISO字符串，add/update/move时需要）',
                },
                updates: {
                  type: 'object',
                  description: '更新数据（update时需要）',
                },
                newTripDayId: {
                  type: 'string',
                  description: '新日期ID（move时需要）',
                },
                newStartTime: {
                  type: 'string',
                  description: '新开始时间（move时需要）',
                },
                newEndTime: {
                  type: 'string',
                  description: '新结束时间（move时需要）',
                },
              },
              required: ['type'],
            },
            minItems: 1,
          },
        },
        required: ['trip_id', 'edits'],
      },
      output_schema: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
        },
      },
      execute: async (input: { trip_id: string; edits: any[] }, _state: any) => {
        // 应用编辑逻辑
        if (!itineraryItemsService) {
          throw new Error('ItineraryItemsService is required for apply_user_edit action');
        }

        const { trip_id, edits } = input;
        
        // 验证 trip_id
        if (!trip_id) {
          return {
            success: false,
            error: 'trip_id is required',
            results: [],
            appliedCount: 0,
            totalCount: 0,
          };
        }
        
        // 确保 edits 是数组
        if (!edits) {
          return {
            success: false,
            error: 'edits is required and must be an array',
            results: [],
            appliedCount: 0,
            totalCount: 0,
          };
        }
        
        // 如果 edits 不是数组，尝试转换或返回错误
        let editsArray: any[];
        if (Array.isArray(edits)) {
          editsArray = edits;
        } else if (typeof edits === 'object' && edits !== null) {
          // 如果 edits 是单个对象，转换为数组
          editsArray = [edits];
          // Note: Using console for logging in action functions
          console.warn(`[trip.apply_user_edit] edits is not an array, converted single object to array`);
        } else {
          return {
            success: false,
            error: `edits must be an array or object, got ${typeof edits}`,
            results: [],
            appliedCount: 0,
            totalCount: 0,
          };
        }
        
        // 验证 edits 数组不为空
        if (editsArray.length === 0) {
          return {
            success: false,
            error: 'edits array cannot be empty',
            results: [],
            appliedCount: 0,
            totalCount: 0,
          };
        }
        
        const results: Array<{ type: string; success: boolean; error?: string }> = [];

        for (const edit of editsArray) {
          try {
            if (edit.type === 'delete' && edit.itemId) {
              // 删除项
              await itineraryItemsService.remove(edit.itemId);
              results.push({ type: 'delete', success: true });
            } else if (edit.type === 'update' && edit.itemId && edit.updates) {
              // 更新项
              await itineraryItemsService.update(edit.itemId, edit.updates);
              results.push({ type: 'update', success: true });
            } else if (edit.type === 'move' && edit.itemId) {
              // 移动项：更新 tripDayId 和时间
              const updateData: any = {};
              if (edit.newTripDayId) {
                updateData.tripDayId = edit.newTripDayId;
              }
              if (edit.newStartTime) {
                updateData.startTime = edit.newStartTime;
              }
              if (edit.newEndTime) {
                updateData.endTime = edit.newEndTime;
              }
              if (Object.keys(updateData).length > 0) {
                await itineraryItemsService.update(edit.itemId, updateData);
                results.push({ type: 'move', success: true });
              } else {
                results.push({ type: 'move', success: false, error: 'No update data provided' });
              }
            } else {
              results.push({ type: edit.type || 'unknown', success: false, error: 'Invalid edit format' });
            }
          } catch (error: any) {
            results.push({ 
              type: edit.type || 'unknown', 
              success: false, 
              error: error?.message || String(error) 
            });
          }
        }

        const allSuccess = results.every(r => r.success);
        return { 
          success: allSuccess,
          results,
          appliedCount: results.filter(r => r.success).length,
          totalCount: results.length
        };
      },
    },
    {
      name: 'trip.persist_plan',
      description: '持久化规划结果',
      metadata: {
        kind: ActionKind.EXTERNAL,
        cost: ActionCost.MEDIUM,
        side_effect: ActionSideEffect.WRITES_DB,
        preconditions: ['result.timeline'],
        idempotent: false,
        cacheable: false,
      },
      input_schema: {
        type: 'object',
        properties: {
          trip_id: { type: 'string' },
          timeline: { type: 'array' },
        },
        required: ['trip_id', 'timeline'],
      },
      output_schema: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
        },
      },
      execute: async (input: { trip_id: string; timeline: any[] }, _state: any) => {
        // 持久化规划结果
        const { trip_id, timeline } = input;
        
        if (!timeline || timeline.length === 0) {
          return { success: false, error: 'Timeline is empty' };
        }

        try {
          // 获取行程信息以获取日期
          const trip = await tripsService.findOne(trip_id);
          const results: Array<{ date: string; success: boolean; error?: string }> = [];

          // 遍历 timeline，假设每个元素可能是：
          // 1. DayScheduleResult 对象（需要从 trip.days 获取日期）
          // 2. { date: string, schedule: DayScheduleResult } 对象
          
          for (let i = 0; i < timeline.length && i < (trip.days?.length || 0); i++) {
            const timelineItem = timeline[i];
            const day = trip.days[i];
            
            let schedule: DayScheduleResult;
            let dateISO: string;

            // 判断 timelineItem 的格式
            if (timelineItem.schedule) {
              // 格式：{ date: string, schedule: DayScheduleResult }
              schedule = timelineItem.schedule;
              dateISO = timelineItem.date || DateTime.fromJSDate(day.date).toISODate() || '';
            } else if (timelineItem.stops) {
              // 格式：DayScheduleResult（直接是 schedule）
              schedule = timelineItem as DayScheduleResult;
              dateISO = DateTime.fromJSDate(day.date).toISODate() || '';
            } else {
              const dayDateISO = DateTime.fromJSDate(day.date).toISODate() || 'unknown';
              results.push({ 
                date: dayDateISO, 
                success: false, 
                error: 'Invalid timeline item format' 
              });
              continue;
            }

            if (!dateISO) {
              results.push({ 
                date: 'unknown', 
                success: false, 
                error: 'Could not determine date' 
              });
              continue;
            }

            // 使用 TripsService.saveSchedule 保存
            try {
              await tripsService.saveSchedule(trip_id, dateISO, schedule);
              results.push({ date: dateISO, success: true });
            } catch (error: any) {
              results.push({ 
                date: dateISO, 
                success: false, 
                error: error?.message || String(error) 
              });
            }
          }

          const allSuccess = results.every(r => r.success);
          return { 
            success: allSuccess,
            results,
            savedCount: results.filter(r => r.success).length,
            totalCount: results.length
          };
        } catch (error: any) {
          return { 
            success: false, 
            error: error?.message || String(error) 
          };
        }
      },
    },
  ];
}

