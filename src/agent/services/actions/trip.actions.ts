// src/agent/services/actions/trip.actions.ts
import { Action, ActionKind, ActionCost, ActionSideEffect } from '../../interfaces/action.interface';
import { TripsService } from '../../../trips/trips.service';
import { ItineraryItemsService } from '../../../itinerary-items/itinerary-items.service';
import { ItemType } from '../../../itinerary-items/dto/create-itinerary-item.dto';
import { DayScheduleResult } from '../../../planning-policy/interfaces/scheduler.interface';
import { DateTime } from 'luxon';

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
      execute: async (input: { trip_id: string }, state: any) => {
        // 调用实际的 TripsService
        const trip = await tripsService.findOne(input.trip_id);
        
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
        };
      },
    },
    {
      name: 'trip.apply_user_edit',
      description: '应用用户编辑',
      metadata: {
        kind: ActionKind.INTERNAL,
        cost: ActionCost.LOW,
        side_effect: ActionSideEffect.WRITES_DB,
        preconditions: ['trip.trip_id'],
        idempotent: false,
        cacheable: false,
      },
      input_schema: {
        type: 'object',
        properties: {
          trip_id: { type: 'string' },
          edits: { type: 'array' },
        },
        required: ['trip_id', 'edits'],
      },
      output_schema: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
        },
      },
      execute: async (input: { trip_id: string; edits: any[] }, state: any) => {
        // 应用编辑逻辑
        if (!itineraryItemsService) {
          throw new Error('ItineraryItemsService is required for apply_user_edit action');
        }

        const { trip_id, edits } = input;
        const results: Array<{ type: string; success: boolean; error?: string }> = [];

        for (const edit of edits) {
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
      execute: async (input: { trip_id: string; timeline: any[] }, state: any) => {
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

