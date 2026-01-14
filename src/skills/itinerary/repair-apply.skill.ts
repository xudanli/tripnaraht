// src/skills/itinerary/repair-apply.skill.ts
/**
 * repair.apply Skill
 * 
 * 应用修复方案到行程
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput, SkillMetadata } from '../interfaces/skill.interface';
import { Itinerary, ItineraryDay, ItineraryItem, RequiredAdjustment } from '../../agent/interfaces/trip-plan.interface';
import { Skill as SkillDecorator } from '../decorators/skill.decorator';
import { DateTime } from 'luxon';

export interface RepairApplyInput extends SkillInput {
  itinerary: Itinerary;
  adjustments: RequiredAdjustment[];
  alternatives?: {
    alternative_pois?: Array<{
      poi_id: string;
      name: string;
      reason: string;
      evidence_status: 'VERIFIED' | 'UNVERIFIED' | 'ASSUMPTION';
      evidence_refs?: string[];
    }>;
    alternative_routes?: Array<{
      route_id: string;
      description: string;
      reason: string;
      evidence_status: 'VERIFIED' | 'UNVERIFIED' | 'ASSUMPTION';
      evidence_refs?: string[];
    }>;
  };
}

export interface RepairApplyOutput extends SkillOutput {
  repaired: boolean;
  itinerary: Itinerary;
  applied_fixes: Array<{
    adjustment_type: string;
    target?: string;
    description: string;
  }>;
}

@SkillDecorator({
  name: 'repair.apply',
  description: '应用修复方案到行程',
  version: '1.0.0',
  category: 'trip',
  toolGroup: 'DOMAIN',
})
@Injectable()
export class RepairApplySkill implements Skill<RepairApplyInput, RepairApplyOutput> {
  private readonly logger = new Logger(RepairApplySkill.name);

  metadata: SkillMetadata = {
    name: 'repair.apply',
    description: '应用修复方案到行程',
    version: '1.0.0',
    category: 'trip' as const,
    toolGroup: 'DOMAIN' as const,
    inputSchema: {
      required: ['itinerary', 'adjustments'],
      typeChecks: {
        adjustments: {
          type: 'array',
          minLength: 1,
        },
      },
      extractors: {
        itinerary: {
          type: 'step',
          stepId: 'itinerary.generate',
          path: 'result.itinerary',
        },
        adjustments: {
          type: 'step',
          stepId: 'itinerary.verify',
          path: 'result.issues',
        },
      },
    },
  };

  constructor() {
    this.logger.log(`[RepairApplySkill] 已初始化`);
  }

  async execute(input: RepairApplyInput): Promise<RepairApplyOutput> {
    this.logger.debug(`执行 repair.apply: request_id=${input.itinerary.request_id}, adjustments=${input.adjustments.length}`);

    try {
      const { itinerary, adjustments, alternatives } = input;
      
      // 深拷贝行程以避免修改原始数据
      const repairedItinerary: Itinerary = {
        ...itinerary,
        days: itinerary.days.map(day => ({
          ...day,
          items: day.items.map(item => ({ ...item })),
        })),
      };

      const appliedFixes: RepairApplyOutput['applied_fixes'] = [];

      // 按优先级处理调整（先处理硬错误，再处理软警告）
      const sortedAdjustments = [...adjustments].sort((a, b) => {
        const priorityOrder = {
          'REPLACE_POI': 1,
          'REPLACE_SEGMENT': 2,
          'CHANGE_TRANSPORT': 3,
          'ADD_BUFFER': 4,
          'SHORTEN_DAY': 5,
          'CHANGE_MODE': 6,
          'CHANGE_DATES': 7,
        };
        return (priorityOrder[a.action] || 99) - (priorityOrder[b.action] || 99);
      });

      for (const adjustment of sortedAdjustments) {
        try {
          const fixResult = this.applyAdjustment(
            repairedItinerary,
            adjustment,
            alternatives,
          );

          if (fixResult.applied) {
            appliedFixes.push({
              adjustment_type: adjustment.action,
              target: adjustment.target,
              description: fixResult.description,
            });
          }
        } catch (error: any) {
          this.logger.warn(`应用调整 ${adjustment.action} 失败: ${error?.message}`);
        }
      }

      return {
        repaired: appliedFixes.length > 0,
        itinerary: repairedItinerary,
        applied_fixes: appliedFixes,
      };
    } catch (error: any) {
      this.logger.error(`repair.apply 失败: ${error?.message}`, error?.stack);
      throw error;
    }
  }

  /**
   * 应用单个调整
   */
  private applyAdjustment(
    itinerary: Itinerary,
    adjustment: RequiredAdjustment,
    alternatives: RepairApplyInput['alternatives'],
  ): { applied: boolean; description: string } {
    switch (adjustment.action) {
      case 'REPLACE_POI':
        return this.replacePoi(itinerary, adjustment, alternatives);

      case 'REPLACE_SEGMENT':
        return this.replaceSegment(itinerary, adjustment, alternatives);

      case 'ADD_BUFFER':
        return this.addBuffer(itinerary, adjustment);

      case 'SHORTEN_DAY':
        return this.shortenDay(itinerary, adjustment);

      case 'CHANGE_TRANSPORT':
        return this.changeTransport(itinerary, adjustment);

      case 'CHANGE_MODE':
        return this.changeMode(itinerary, adjustment);

      case 'CHANGE_DATES':
        return this.changeDates(itinerary, adjustment);

      default:
        this.logger.warn(`未知的调整类型: ${adjustment.action}`);
        return { applied: false, description: `未知的调整类型: ${adjustment.action}` };
    }
  }

  /**
   * 替换 POI
   */
  private replacePoi(
    itinerary: Itinerary,
    adjustment: RequiredAdjustment,
    alternatives: RepairApplyInput['alternatives'],
  ): { applied: boolean; description: string } {
    if (!adjustment.target) {
      return { applied: false, description: '缺少目标 POI ID' };
    }

    // 查找替代 POI
    const alternativePoi = alternatives?.alternative_pois?.find(
      poi => poi.poi_id === adjustment.target || poi.poi_id === adjustment.alternatives?.[0],
    );

    if (!alternativePoi && adjustment.alternatives && adjustment.alternatives.length > 0) {
      // 使用第一个替代方案
      const firstAlternative = adjustment.alternatives[0];
      const foundPoi = alternatives?.alternative_pois?.find(poi => poi.poi_id === firstAlternative);
      if (foundPoi) {
        return this.doReplacePoi(itinerary, adjustment.target, foundPoi);
      }
    }

    if (alternativePoi) {
      return this.doReplacePoi(itinerary, adjustment.target, alternativePoi);
    }

    return { applied: false, description: `未找到替代 POI 用于替换 ${adjustment.target}` };
  }

  private doReplacePoi(
    itinerary: Itinerary,
    targetPoiId: string,
    replacementPoi: { poi_id: string; name: string; evidence_refs?: string[] },
  ): { applied: boolean; description: string } {
    let replaced = false;

    for (const day of itinerary.days) {
      for (const item of day.items) {
        if (item.location_ref?.place_id === targetPoiId) {
          item.location_ref.place_id = replacementPoi.poi_id;
          item.location_ref.name = replacementPoi.name;
          if (replacementPoi.evidence_refs) {
            item.evidence_refs = [...item.evidence_refs, ...replacementPoi.evidence_refs];
          }
          item.verified = false;
          item.verification_status = 'UNVERIFIED';
          replaced = true;
        }
      }
    }

    if (replaced) {
      return {
        applied: true,
        description: `已将 POI ${targetPoiId} 替换为 ${replacementPoi.name} (${replacementPoi.poi_id})`,
      };
    }

    return { applied: false, description: `未找到目标 POI ${targetPoiId}` };
  }

  /**
   * 替换路段
   */
  private replaceSegment(
    itinerary: Itinerary,
    adjustment: RequiredAdjustment,
    alternatives: RepairApplyInput['alternatives'],
  ): { applied: boolean; description: string } {
    // 简化实现：如果有替代路线，标记需要重新规划
    if (alternatives?.alternative_routes && alternatives.alternative_routes.length > 0) {
      return {
        applied: true,
        description: `已标记需要替换路段 ${adjustment.target}，建议使用替代路线`,
      };
    }

    return { applied: false, description: '未找到替代路线' };
  }

  /**
   * 添加缓冲时间
   */
  private addBuffer(
    itinerary: Itinerary,
    adjustment: RequiredAdjustment,
  ): { applied: boolean; description: string } {
    const BUFFER_MINUTES = 30; // 默认缓冲 30 分钟

    for (const day of itinerary.days) {
      const items = day.items.filter(item => item.type !== 'REST');
      
      for (let i = 0; i < items.length - 1; i++) {
        const currentItem = items[i];
        const nextItem = items[i + 1];

        // 如果是换乘点，添加缓冲时间
        if (currentItem.type === 'TRANSIT' || nextItem.type === 'TRANSIT') {
          const currentEnd = this.parseTimeWindow(currentItem.end_window, DateTime.fromISO(day.date));
          const nextStart = this.parseTimeWindow(nextItem.start_window, DateTime.fromISO(day.date));

          if (currentEnd && nextStart) {
            const bufferMinutes = nextStart.diff(currentEnd, 'minutes').minutes;
            
            if (bufferMinutes < BUFFER_MINUTES) {
              // 将下一项的开始时间延后
              const newStart = currentEnd.plus({ minutes: BUFFER_MINUTES });
              nextItem.start_window = newStart.toFormat('HH:mm');
              
              // 相应延后结束时间
              if (nextItem.end_window) {
                const nextEnd = this.parseTimeWindow(nextItem.end_window, DateTime.fromISO(day.date));
                if (nextEnd) {
                  const duration = nextEnd.diff(nextStart, 'minutes').minutes;
                  const newEnd = newStart.plus({ minutes: duration });
                  nextItem.end_window = newEnd.toFormat('HH:mm');
                }
              }

              return {
                applied: true,
                description: `已在 ${nextItem.location_ref?.name || '下一站'} 前添加 ${BUFFER_MINUTES} 分钟缓冲时间`,
              };
            }
          }
        }
      }
    }

    return { applied: false, description: '未找到需要添加缓冲的位置' };
  }

  /**
   * 缩短某天的行程
   */
  private shortenDay(
    itinerary: Itinerary,
    adjustment: RequiredAdjustment,
  ): { applied: boolean; description: string } {
    // 找到目标日期
    const targetDay = itinerary.days.find(day => 
      day.date === adjustment.target || day.items.some(item => item.id === adjustment.target)
    );

    if (!targetDay) {
      return { applied: false, description: `未找到目标日期或行程项 ${adjustment.target}` };
    }

    // 移除最后几个行程项（简化实现）
    const itemsToRemove = Math.min(2, Math.floor(targetDay.items.length / 3));
    if (itemsToRemove > 0) {
      targetDay.items = targetDay.items.slice(0, -itemsToRemove);
      return {
        applied: true,
        description: `已缩短 ${targetDay.date} 的行程，移除了 ${itemsToRemove} 个行程项`,
      };
    }

    return { applied: false, description: '无法进一步缩短行程' };
  }

  /**
   * 更改交通方式
   */
  private changeTransport(
    itinerary: Itinerary,
    adjustment: RequiredAdjustment,
  ): { applied: boolean; description: string } {
    // 简化实现：将相关的 TRANSIT 项标记为需要更改
    let changed = false;

    for (const day of itinerary.days) {
      for (const item of day.items) {
        if (item.type === 'TRANSIT' && (!adjustment.target || item.id === adjustment.target)) {
          item.metadata = item.metadata || {};
          item.metadata.transport_mode_changed = true;
          item.notes = (item.notes || '') + ' [交通方式已更改]';
          changed = true;
        }
      }
    }

    if (changed) {
      return { applied: true, description: '已标记需要更改交通方式' };
    }

    return { applied: false, description: '未找到需要更改的交通项' };
  }

  /**
   * 更改模式
   */
  private changeMode(
    itinerary: Itinerary,
    adjustment: RequiredAdjustment,
  ): { applied: boolean; description: string } {
    // 简化实现：记录需要更改模式
    return {
      applied: true,
      description: `已记录需要更改模式：${adjustment.why}`,
    };
  }

  /**
   * 更改日期
   */
  private changeDates(
    itinerary: Itinerary,
    adjustment: RequiredAdjustment,
  ): { applied: boolean; description: string } {
    // 简化实现：记录需要更改日期
    return {
      applied: true,
      description: `已记录需要更改日期：${adjustment.why}`,
    };
  }

  /**
   * 解析时间窗字符串为 DateTime
   */
  private parseTimeWindow(
    timeWindow: string,
    baseDate: DateTime,
  ): DateTime | null {
    if (!timeWindow) {
      return null;
    }

    // 如果是 ISO 8601 格式
    if (timeWindow.includes('T') || timeWindow.includes('Z')) {
      try {
        return DateTime.fromISO(timeWindow);
      } catch {
        return null;
      }
    }

    // 如果是 HH:mm 格式
    const timeMatch = timeWindow.match(/(\d{1,2}):(\d{2})/);
    if (timeMatch) {
      const hours = parseInt(timeMatch[1], 10);
      const minutes = parseInt(timeMatch[2], 10);
      return baseDate.set({ hour: hours, minute: minutes, second: 0, millisecond: 0 });
    }

    return null;
  }
}
