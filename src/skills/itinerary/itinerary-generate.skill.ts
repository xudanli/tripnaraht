// src/skills/itinerary/itinerary-generate.skill.ts
/**
 * itinerary.generate Skill
 * 
 * 生成结构化行程草案
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { TripPlanRequest, Itinerary, ItineraryDay, ItineraryItem, GateResult } from '../../agent/interfaces/trip-plan.interface';
import { Skill as SkillDecorator } from '../decorators/skill.decorator';
import { PlanningWorkbenchAgentService } from '../../agent/services/planning-workbench-agent.service';
import { IncrementalItineraryGeneratorService } from '../../agent/context-engine/services/incremental-itinerary-generator.service';
import { DateTime } from 'luxon';

export interface ItineraryGenerateInput extends SkillInput {
  request: TripPlanRequest;
  research_data?: Record<string, any>;
  gate_result?: GateResult;
}

export interface ItineraryGenerateOutput extends SkillOutput {
  request_id: string;
  days: ItineraryDay[];
  metadata?: {
    total_days: number;
    total_cost_estimate?: number;
    robustness_score?: number;
    mode?: string;
  };
}

@SkillDecorator({
  name: 'itinerary.generate',
  description: '生成结构化行程草案',
  version: '1.0.0',
  category: 'trip',
  toolGroup: 'DOMAIN',
})
@Injectable()
export class ItineraryGenerateSkill implements Skill<ItineraryGenerateInput, ItineraryGenerateOutput> {
  private readonly logger = new Logger(ItineraryGenerateSkill.name);

  metadata = {
    name: 'itinerary.generate',
    description: '生成结构化行程草案',
    version: '1.0.0',
    category: 'trip' as const,
    toolGroup: 'DOMAIN' as const,
    inputSchema: {
      required: ['request'],
    },
  };

  constructor(
    @Optional() private readonly planningWorkbench?: PlanningWorkbenchAgentService,
    @Optional() private readonly incrementalGenerator?: IncrementalItineraryGeneratorService,
  ) {
    this.logger.log(
      `[ItineraryGenerateSkill] 已初始化, incrementalGenerator=${!!incrementalGenerator}`,
    );
  }

  async execute(input: ItineraryGenerateInput): Promise<ItineraryGenerateOutput> {
    const requestId = (input.request as any).request_id ?? 'unknown';
    this.logger.debug(`执行 itinerary.generate: request_id=${requestId}`);

    try {
      const { request, research_data, gate_result } = input;

      // 分段规划 POC: 当 days >= 3 时使用 Day1→Day2→Day3 迭代生成
      const useIncremental =
        this.incrementalGenerator &&
        process.env.INCREMENTAL_ITINERARY_POC !== 'false';
      if (useIncremental) {
        const days = this.computeDays(request);
        if (days >= 3) {
          const result = await this.incrementalGenerator.generateIncremental({
            request: { ...request, request_id: requestId } as TripPlanRequest,
            research_data,
            gate_result,
            minDaysToTrigger: 3,
          });
          return {
            request_id: requestId,
            days: result.itinerary.days,
            metadata: {
              total_days: result.itinerary.days.length,
              mode: result.mode,
            },
          };
        }
      }

      // 1. 计算天数
      const days = this.computeDays(request);

      // 2. 获取起始日期
      let startDate: DateTime;
      if (request.date_range) {
        startDate = DateTime.fromISO(request.date_range.start_date);
      } else if (request.start_date) {
        startDate = DateTime.fromISO(request.start_date);
      } else {
        startDate = DateTime.now().plus({ days: 1 }); // 默认明天
      }

      // 3. 提取 POI 证据
      const poiEvidence = research_data?.poi_evidence;
      const pois = Array.isArray(poiEvidence) 
        ? poiEvidence 
        : (poiEvidence?.pois || []);

      // 4. 生成每日行程
      const itineraryDays: ItineraryDay[] = [];
      const itemsPerDay = Math.ceil(pois.length / days);

      for (let dayIndex = 0; dayIndex < days; dayIndex++) {
        const currentDate = startDate.plus({ days: dayIndex });
        const dayItems: ItineraryItem[] = [];

        // 为每一天分配 POI
        const startPoiIndex = dayIndex * itemsPerDay;
        const endPoiIndex = Math.min(startPoiIndex + itemsPerDay, pois.length);
        const dayPois = pois.slice(startPoiIndex, endPoiIndex);

        // 为每个 POI 创建行程项
        for (let i = 0; i < dayPois.length; i++) {
          const poi = dayPois[i];
          const poiId = poi.poi_id || poi.id || `poi_${startPoiIndex + i}`;
          const poiName = poi.name || poi.nameCN || poi.nameEN || '未知地点';
          const poiCoords = poi.coordinates || (poi.lat && poi.lng ? { lat: poi.lat, lng: poi.lng } : undefined);

          // 计算时间窗（简单分配：每个 POI 2 小时，从 9:00 开始）
          const startHour = 9 + i * 2;
          const startTime = `${startHour.toString().padStart(2, '0')}:00`;
          const endTime = `${(startHour + 2).toString().padStart(2, '0')}:00`;

          const item: ItineraryItem = {
            id: `${request.request_id}_day${dayIndex + 1}_item${i + 1}`,
            type: 'POI',
            start_window: startTime,
            end_window: endTime,
            location_ref: {
              place_id: poiId,
              name: poiName,
              coordinates: poiCoords,
              address: poi.address,
            },
            evidence_refs: poi.evidence_id ? [poi.evidence_id] : [],
            verified: false,
            verification_status: 'UNVERIFIED',
            metadata: {
              duration_minutes: 120, // 默认 2 小时
            },
          };

          dayItems.push(item);
        }

        // 如果没有 POI，至少添加一个占位项
        if (dayItems.length === 0) {
          dayItems.push({
            id: `${request.request_id}_day${dayIndex + 1}_placeholder`,
            type: 'REST',
            start_window: '09:00',
            end_window: '18:00',
            location_ref: {
              name: '待安排',
            },
            evidence_refs: [],
            verified: false,
            verification_status: 'ASSUMPTION',
          });
        }

        itineraryDays.push({
          date: currentDate.toISODate() || currentDate.toFormat('yyyy-MM-dd'),
          items: dayItems,
        });
      }

      // 5. 计算总成本估算（如果有预算信息）
      let totalCostEstimate: number | undefined;
      if (request.constraints?.budget?.total) {
        // 简单估算：将预算按天数分配
        totalCostEstimate = request.constraints.budget.total;
      }

      // 6. 计算鲁棒性评分
      const robustnessScore = this.calculateRobustnessScore(pois, gate_result, research_data);

      return {
        request_id: request.request_id,
        days: itineraryDays,
        metadata: {
          total_days: days,
          total_cost_estimate: totalCostEstimate,
          robustness_score: robustnessScore,
        },
      };
    } catch (error: any) {
      this.logger.error(`itinerary.generate 失败: ${error?.message}`, error?.stack);
      throw error;
    }
  }

  /**
   * 计算行程天数
   */
  private computeDays(request: TripPlanRequest): number {
    if (request.days) return request.days;
    if (request.date_range) {
      const start = DateTime.fromISO(request.date_range.start_date);
      const end = DateTime.fromISO(request.date_range.end_date);
      return end.diff(start, 'days').days + 1;
    }
    if ((request as any).start_date) return (request as any).days || 5;
    return 5;
  }

  /**
   * 计算鲁棒性评分（0..1）
   */
  private calculateRobustnessScore(
    pois: any[],
    gateResult?: GateResult,
    researchData?: Record<string, any>,
  ): number {
    let score = 0.5; // 基础分

    // 有 POI 证据加分
    if (pois && pois.length > 0) {
      score += 0.2;
    }

    // 有交通证据加分
    if (researchData?.transport_evidence) {
      score += 0.1;
    }

    // 有开放时间证据加分
    if (researchData?.opening_hours_evidence) {
      score += 0.1;
    }

    // Gate 结果影响评分
    if (gateResult) {
      if (gateResult.gate_result === 'ALLOW') {
        score += 0.1;
      } else if (gateResult.gate_result === 'ADJUST_REQUIRED') {
        score -= 0.1;
      } else if (gateResult.gate_result === 'BLOCK') {
        score -= 0.3;
      }
    }

    return Math.max(0, Math.min(1, score));
  }
}
