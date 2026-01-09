// src/skills/context/plan-select-slices.skill.ts
/**
 * tripnara.plan.selectSlices
 * 
 * P0: 计划切片选择（Plan RAG）
 * 
 * 当 Neptune/DrDre 在修复时，只需要：
 * - 当前 day 的结构
 * - 出问题的 segment/poi
 * - 最近一次 Abu rejection 的原因
 */

import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { PrismaService } from '../../prisma/prisma.service';
import { ContextBlock } from '../../agent/context-engine/types/context-package.types';

export interface PlanSelectSlicesInput extends SkillInput {
  /** Trip ID */
  tripId: string;
  
  /** 切片范围 */
  scope: string[]; // ["day:2", "segment:drive_3", "rejection:last"]
  
  /** 规划阶段 */
  phase?: string;
}

export interface PlanSelectSlicesOutput extends SkillOutput {
  /** 选中的计划切片块 */
  blocks: ContextBlock[];
  
  /** 切片摘要 */
  summary: {
    selectedDays: number[];
    selectedSegments: string[];
    latestRejection?: {
      persona: string;
      reason: string;
      timestamp: string;
    };
  };
}

@Injectable()
export class PlanSelectSlicesSkill implements Skill<PlanSelectSlicesInput, PlanSelectSlicesOutput> {
  private readonly logger = new Logger(PlanSelectSlicesSkill.name);

  metadata = {
    name: 'plan.selectSlices',
    description: '选择计划相关片段（Plan RAG）：根据 scope 返回当前 day/segment/rejection 的结构化块',
    version: '1.0.0',
    category: 'rag' as const,
    toolGroup: 'CONTEXT' as const,
  };

  constructor(
    @Inject('PrismaService') @Optional() private readonly prisma?: PrismaService,
  ) {}

  async execute(input: PlanSelectSlicesInput): Promise<PlanSelectSlicesOutput> {
    this.logger.debug(`执行 plan.selectSlices: tripId=${input.tripId}, scope=${input.scope.join(', ')}`);

    const blocks: ContextBlock[] = [];
    const selectedDays: number[] = [];
    const selectedSegments: string[] = [];

    try {
      if (!this.prisma) {
        throw new Error('PrismaService 未注入');
      }

      // 1. 解析 scope
      for (const item of input.scope) {
        if (item.startsWith('day:')) {
          const dayNumber = parseInt(item.split(':')[1], 10);
          if (!isNaN(dayNumber)) {
            selectedDays.push(dayNumber);
          }
        } else if (item.startsWith('segment:')) {
          const segmentId = item.split(':')[1];
          selectedSegments.push(segmentId);
        }
      }

      // 获取所有 TripDay（供后续 segment 使用）
      const tripDays = await this.prisma.tripDay.findMany({
        where: {
          tripId: input.tripId,
        },
        include: {
          ItineraryItem: {
            include: {
              Place: true,
            },
            orderBy: {
              startTime: 'asc',
            },
          },
        },
        orderBy: {
          date: 'asc',
        },
      });

      // 2. 获取指定天的结构
      if (selectedDays.length > 0) {

        for (const dayNumber of selectedDays) {
          const day = tripDays[dayNumber - 1]; // 1-based indexing
          if (day) {
            // 按开始时间排序（因为 schema 中没有 order 字段）
            const sortedItems = [...day.ItineraryItem].sort((a, b) => {
              if (!a.startTime && !b.startTime) return 0;
              if (!a.startTime) return 1;
              if (!b.startTime) return -1;
              return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
            });

            const itemsSummary = sortedItems.map((item: any, index: number) => {
              const placeName = item.Place?.nameCN || item.Place?.nameEN || item.note || `Place ${item.placeId || 'Unknown'}`;
              const parts = [`${index + 1}. [${item.type}] ${placeName}`];
              
              // 计算时长（从 startTime 和 endTime）
              if (item.startTime && item.endTime) {
                const durationMs = new Date(item.endTime).getTime() - new Date(item.startTime).getTime();
                const durationMinutes = Math.round(durationMs / (1000 * 60));
                const hours = Math.floor(durationMinutes / 60);
                const minutes = durationMinutes % 60;
                parts.push(`${hours}h${minutes}m`);
              }
              
              if (item.startTime) {
                parts.push(`开始: ${new Date(item.startTime).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`);
              }
              
              if (item.note) {
                parts.push(`备注: ${item.note}`);
              }
              
              return parts.join(' - ');
            }).join('\n');

            blocks.push({
              key: `PLAN_DAY_${dayNumber}`,
              type: 'PLAN_DAY',
              text: `第 ${dayNumber} 天结构 (${day.date.toISOString().split('T')[0]}):\n${itemsSummary}`,
              priority: 80,
              visibility: 'public',
              provenance: {
                source: 'db',
                identifier: `trip:${input.tripId}:day:${dayNumber}`,
                timestamp: new Date().toISOString(),
              },
              data: {
                dayNumber,
                date: day.date.toISOString(),
                itemsCount: day.ItineraryItem.length,
                items: day.ItineraryItem.map((item: any) => ({
                  id: item.id,
                  type: item.type,
                  name: item.name,
                  placeId: item.placeId,
                  placeName: item.place?.nameCN || item.place?.nameEN,
                  order: item.order,
                  durationMinutes: item.durationMinutes,
                  distanceKm: item.distanceKm,
                  startTime: item.startTime?.toISOString(),
                  endTime: item.endTime?.toISOString(),
                })),
              },
            });
          }
        }
      }

      // 3. 获取指定 segment 的结构
      if (selectedSegments.length > 0) {
        // 从 ItineraryItem 中查找 segment
        // 注意：ItineraryItem 没有 order 字段，使用 startTime 排序
        const allItems = await this.prisma.itineraryItem.findMany({
          where: {
            TripDay: {
              tripId: input.tripId,
            },
          },
          include: {
            TripDay: true,
            Place: true,
          },
          orderBy: [
            { TripDay: { date: 'asc' } },
            { startTime: 'asc' },
          ],
        });

        // segment 可能是通过 type='drive' 或 type='fly' 的连续 items 组成
        // 或者是通过 metadata.segmentId 标识
        for (const segmentId of selectedSegments) {
          // 方法1: 通过 ID 直接匹配
          let segmentItems = allItems.filter((item: any) => item.id === segmentId);

          // 方法2: 如果 segmentId 是数字，可能是通过连续的同类型 items 组成
          if (segmentItems.length === 0 && /^\d+$/.test(segmentId)) {
            const segmentIndex = parseInt(segmentId, 10);
            // 查找所有 TRANSIT 类型的 items（对应 drive/fly/ferry），按顺序分组
            const transportItems = allItems.filter((item: any) => 
              item.type === 'TRANSIT'
            );
            if (transportItems[segmentIndex - 1]) {
              segmentItems = [transportItems[segmentIndex - 1]];
            }
          }

          // 方法3: 如果 segmentId 包含类型前缀（如 drive_3, fly_1），查找对应的 transport items
          // 注意：ItineraryItem.type 是 ItemType 枚举（如 TRANSIT），需要映射
          if (segmentItems.length === 0) {
            const match = segmentId.match(/^(drive|fly|ferry|transit)_(\d+)$/i);
            if (match) {
              const index = parseInt(match[2], 10) - 1;
              // 所有交通类型在 schema 中都映射为 TRANSIT
              const transportItems = allItems.filter((item: any) => item.type === 'TRANSIT');
              if (transportItems[index]) {
                segmentItems = [transportItems[index]];
              }
            }
          }

          if (segmentItems.length > 0) {
            // 计算 segment 所在的天数
            const dayNumber = segmentItems[0].TripDay 
              ? tripDays.findIndex((day) => day.id === segmentItems[0].TripDay.id) + 1
              : null;

            // 构建 segment 结构文本
            const segmentParts = segmentItems.map((item: any, idx: number) => {
              const placeName = item.Place?.nameCN || item.Place?.nameEN || item.note || `Place ${item.placeId || 'Unknown'}`;
              const parts: string[] = [];
              
              parts.push(`[${item.type || 'activity'}] ${placeName}`);
              
              // 计算时长
              if (item.startTime && item.endTime) {
                const durationMs = new Date(item.endTime).getTime() - new Date(item.startTime).getTime();
                const durationMinutes = Math.round(durationMs / (1000 * 60));
                const hours = Math.floor(durationMinutes / 60);
                const minutes = durationMinutes % 60;
                parts.push(`时长: ${hours}h${minutes}m`);
              }
              
              if (item.startTime) {
                parts.push(`开始: ${new Date(item.startTime).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`);
              }

              if (item.note) {
                parts.push(`备注: ${item.note}`);
              }

              return `${idx + 1}. ${parts.join(', ')}`;
            });

            const segmentText = segmentParts.join('\n');
            const dayInfo = dayNumber ? ` (第 ${dayNumber} 天)` : '';

            blocks.push({
              key: `PLAN_SEGMENT_${segmentId}`,
              type: 'PLAN_SEGMENT',
              text: `Segment ${segmentId}${dayInfo} 结构:\n${segmentText}`,
              priority: 75,
              visibility: 'public',
              provenance: {
                source: 'db',
                identifier: `trip:${input.tripId}:segment:${segmentId}`,
                timestamp: new Date().toISOString(),
              },
              data: {
                segmentId,
                dayNumber,
                itemsCount: segmentItems.length,
                items: segmentItems.map((item: any) => {
                  const durationMinutes = item.startTime && item.endTime
                    ? Math.round((new Date(item.endTime).getTime() - new Date(item.startTime).getTime()) / (1000 * 60))
                    : null;
                  
                  return {
                    id: item.id,
                    type: item.type,
                    placeId: item.placeId,
                    placeName: item.Place?.nameCN || item.Place?.nameEN,
                    durationMinutes,
                    startTime: item.startTime?.toISOString(),
                    endTime: item.endTime?.toISOString(),
                    note: item.note,
                    dayId: item.TripDay?.id,
                  };
                }),
              },
            });
          } else {
            // 如果找不到 segment，记录警告但仍然创建块
            this.logger.warn(`未找到 segment: ${segmentId}`);
            blocks.push({
              key: `PLAN_SEGMENT_${segmentId}`,
              type: 'PLAN_SEGMENT',
              text: `Segment ${segmentId} 的结构（未找到对应数据）`,
              priority: 75,
              visibility: 'public',
              provenance: {
                source: 'db',
                identifier: `trip:${input.tripId}:segment:${segmentId}`,
                timestamp: new Date().toISOString(),
              },
            });
          }
        }
      }

      // 4. 获取最近一次 rejection
      if (input.scope.includes('rejection:last')) {
        const latestRejection = await this.prisma.decisionLog.findFirst({
          where: {
            tripId: input.tripId,
            action: 'REJECT',
          },
          orderBy: {
            timestamp: 'desc',
          },
        });

        if (latestRejection) {
          blocks.push({
            key: 'REJECTION_LAST',
            type: 'REJECTION_LOG',
            text: `最近一次拒绝 [${latestRejection.persona}]: ${latestRejection.explanation} (原因: ${latestRejection.reasonCodes.join(', ')})`,
            priority: 85,
            visibility: 'public',
            provenance: {
              source: 'db',
              identifier: `decision_log:${latestRejection.id}`,
              timestamp: latestRejection.timestamp.toISOString(),
            },
            data: {
              persona: latestRejection.persona,
              action: latestRejection.action,
              explanation: latestRejection.explanation,
              reasonCodes: latestRejection.reasonCodes,
              timestamp: latestRejection.timestamp.toISOString(),
            },
          });
        }
      }

      return {
        blocks,
        summary: {
          selectedDays,
          selectedSegments,
          latestRejection: blocks.find((b) => b.key === 'REJECTION_LAST')?.data as any,
        },
      };
    } catch (error: any) {
      this.logger.error(`选择计划切片失败: ${error.message}`, error.stack);
      throw error;
    }
  }
}