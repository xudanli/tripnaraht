// src/skills/itinerary/itinerary-verify.skill.ts
/**
 * itinerary.verify Skill
 * 
 * 验证行程的可行性：
 * - 开放时间冲突
 * - 换乘 buffer
 * - 可达性
 * - 疲劳阈值
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput, SkillMetadata } from '../interfaces/skill.interface';
import { Itinerary } from '../../agent/interfaces/trip-plan.interface';
import { applyRiskTagsFromVerifyIssues, type VerifyIssueLike } from '../../agent/utils/itinerary-risk-tags.util';
import { Skill as SkillDecorator } from '../decorators/skill.decorator';
import { OpeningHoursUtil } from '../../common/utils/opening-hours.util';
import { DateTime } from 'luxon';
import type { ConstraintViolation } from '../../agent/services/route-feasibility.types';
import { CONSTRAINT_IDS } from '../../agent/services/constraint-registry';
import type { SafetravelRouteAlertEvidence } from './safetravel-verify-evidence.util';
import {
  collectIcelandVehicleTerrainArbitrationIssues,
  type IcelandVehicleIntentHints,
} from './iceland-vehicle-terrain-arbitrator.util';
import { collectIcelandInsurancePolicyIssues } from './iceland-insurance-arbitrator.util';
import { applySafetravelClosureShadowReadOnlyPhase } from './temporal-shadow-closure.util';
import { WorldDecisionMemoryService } from '../../agent/memory/decision-memory/world-decision-memory.service';
import { appendVehicleTerrainArbitrationTrace } from '../../agent/memory/decision-memory/vehicle-terrain-decision-memory.util';
import { WorldStrategyService } from '../../agent/strategy/world-strategy.service';

export interface ItineraryVerifyInput extends SkillInput {
  itinerary: Itinerary;
  research_data?: Record<string, any>;
  /** 用户原话（可选）：冰岛车型–路况仲裁用于「提车/换车」与 SafeTravel 风况组合 */
  user_query?: string;
  /** 结构化车辆意图（可选）：与 TripPlanRequest.constraints.vehicle_type 等对齐，用于无 Booking 行时的虚拟租车注入 */
  intent_hints?: IcelandVehicleIntentHints;
}

export interface ItineraryVerifyOutput extends SkillOutput {
  verified: boolean;
  issues: Array<{
    type: 'OPENING_HOURS_CONFLICT' | 'TRANSFER_BUFFER_INSUFFICIENT' | 'REACHABILITY_ISSUE' | 'FATIGUE_THRESHOLD_EXCEEDED' | 'TIME_WINDOW_OVERLAP';
    severity: 'CRITICAL' | 'ERROR' | 'WARNING' | 'INFO';
    item_id?: string;
    /** TIME_WINDOW_OVERLAP：与 item_id（后项）构成重叠对的另一项（前项） */
    related_item_id?: string;
    day?: string;
    message: string;
    suggestion?: string;
    /** Optional L3 proof payload (best-effort). */
    violation?: ConstraintViolation;
  }>;
  summary: {
    total_issues: number;
    error_count: number;
    warning_count: number;
    /** 建议性 INFO（不计入 verified 阻断；不计入 error_count / warning_count） */
    info_count: number;
  };
}

@SkillDecorator({
  name: 'itinerary.verify',
  description: '验证行程的可行性（开放时间冲突、换乘 buffer、可达性、疲劳阈值）',
  version: '1.0.0',
  category: 'trip',
  toolGroup: 'DOMAIN',
})
@Injectable()
export class ItineraryVerifySkill implements Skill<ItineraryVerifyInput, ItineraryVerifyOutput> {
  private readonly logger = new Logger(ItineraryVerifySkill.name);

  metadata: SkillMetadata = {
    name: 'itinerary.verify',
    description: '验证行程的可行性（开放时间冲突、换乘 buffer、可达性、疲劳阈值）',
    version: '1.0.0',
    category: 'trip' as const,
    toolGroup: 'DOMAIN' as const,
    inputSchema: {
      required: ['itinerary'],
      typeChecks: {
        itinerary: {
          type: 'object',
        },
      },
      extractors: {
        itinerary: {
          type: 'step',
          stepId: 'itinerary.generate',
          path: 'result.itinerary',
        },
      },
    },
  };

  constructor(
    @Optional() private readonly worldDecisionMemory?: WorldDecisionMemoryService,
    @Optional() private readonly worldStrategy?: WorldStrategyService,
  ) {
    this.logger.log(`[ItineraryVerifySkill] 已初始化`);
  }

  async execute(input: ItineraryVerifyInput): Promise<ItineraryVerifyOutput> {
    this.logger.debug(`执行 itinerary.verify: request_id=${input.itinerary.request_id}`);

    try {
      const { itinerary, research_data, user_query } = input;
      const issues: ItineraryVerifyOutput['issues'] = [];

      // 1. 验证开放时间冲突
      this.verifyOpeningHours(itinerary, research_data, issues);

      // 2. 验证换乘 buffer
      this.verifyTransferBuffers(itinerary, issues);

      // 3a. SafeTravel / 封路证据（与 route_segment_ref 对齐）→ REACHABILITY_ISSUE
      this.verifySafetravelRouteAlerts(itinerary, research_data, issues);
      // 3a1. Verify V2 只读：封路 cut-point 锚点（不删项；供 smart_update / 级联传播后续接入）
      applySafetravelClosureShadowReadOnlyPhase(itinerary, research_data as Record<string, unknown> | undefined);

      // 3a2. 冰岛 V2：车型–路况仲裁（F-road × 2WD、冬季胎、大风提车）→ World Decision Memory
      const terrainIssues = collectIcelandVehicleTerrainArbitrationIssues({
        itinerary,
        research_data,
        user_query,
        intent_hints: input.intent_hints,
        world_strategy: this.worldStrategy?.getIcelandStrategyV1(),
      });
      issues.push(...terrainIssues);
      appendVehicleTerrainArbitrationTrace(this.worldDecisionMemory, {
        terrainIssues,
        itinerary,
        research_data,
        user_query,
        intent_hints: input.intent_hints,
      });

      issues.push(
        ...collectIcelandInsurancePolicyIssues({
          itinerary,
          research_data,
          user_query,
        }),
      );

      // 3b. 验证可达性（如果有交通证据）
      this.verifyReachability(itinerary, research_data, issues);

      // 4. 验证疲劳阈值
      this.verifyFatigueThresholds(itinerary, issues);

      // 5. 验证时间窗重叠
      this.verifyTimeWindowOverlaps(itinerary, issues);

      const errorCount = issues.filter(i => i.severity === 'ERROR' || i.severity === 'CRITICAL').length;
      const warningCount = issues.filter(i => i.severity === 'WARNING').length;
      const infoCount = issues.filter(i => i.severity === 'INFO').length;

      // ADR-B1：按验证问题写入 item.metadata.risk_tags / risk_level（原地更新 itinerary）
      applyRiskTagsFromVerifyIssues(itinerary, issues as readonly VerifyIssueLike[]);

      return {
        verified: errorCount === 0,
        issues,
        summary: {
          total_issues: issues.length,
          error_count: errorCount,
          warning_count: warningCount,
          info_count: infoCount,
        },
      };
    } catch (error: any) {
      this.logger.error(`itinerary.verify 失败: ${error?.message}`, error?.stack);
      throw error;
    }
  }

  /**
   * 验证开放时间冲突
   */
  private verifyOpeningHours(
    itinerary: Itinerary,
    researchData: Record<string, any> | undefined,
    issues: ItineraryVerifyOutput['issues'],
  ): void {
    const openingHoursData = researchData?.opening_hours_evidence;
    if (!openingHoursData) {
      // 如果没有开放时间数据，跳过验证
      return;
    }

    // 构建 POI ID 到开放时间的映射
    const openingHoursMap = new Map<string, any>();
    if (Array.isArray(openingHoursData)) {
      openingHoursData.forEach((item: any) => {
        if (item.poi_id && item.opening_hours) {
          openingHoursMap.set(item.poi_id, item);
        }
      });
    } else if (openingHoursData.opening_hours && Array.isArray(openingHoursData.opening_hours)) {
      openingHoursData.opening_hours.forEach((item: any) => {
        if (item.poi_id && item.opening_hours) {
          openingHoursMap.set(item.poi_id, item);
        }
      });
    }

    // 检查每个行程项
    for (const day of itinerary.days) {
      const dayDate = DateTime.fromISO(day.date);
      
      for (const item of day.items) {
        if (item.type !== 'POI' || !item.location_ref?.place_id) {
          continue;
        }

        const poiId = item.location_ref.place_id;
        const openingHoursInfo = openingHoursMap.get(poiId);
        
        if (!openingHoursInfo) {
          // 没有开放时间数据，标记为警告
          issues.push({
            type: 'OPENING_HOURS_CONFLICT',
            severity: 'WARNING',
            item_id: item.id,
            day: day.date,
            message: `POI "${item.location_ref.name}" 缺少开放时间数据`,
            suggestion: '请确认该地点在指定时间是否开放',
            violation: {
              anchor: { constraintId: CONSTRAINT_IDS.ENTITY_OPENING_HOURS_OVERLAP, ruleId: 'temporal_opening_v1' },
              entityRef: { type: 'POI', id: item.id },
              evidence: {
                source: 'OPENING_HOURS',
              },
              scope: 'LOCAL',
            },
          });
          continue;
        }

        // 检查是否在开放时间内
        const startTime = this.parseTimeWindow(item.start_window, dayDate);
        const endTime = this.parseTimeWindow(item.end_window, dayDate);

        if (startTime && endTime) {
          const isOpen = openingHoursInfo.is_open_now;
          const openingHours = openingHoursInfo.opening_hours;

          if (isOpen === false) {
            issues.push({
              type: 'OPENING_HOURS_CONFLICT',
              severity: 'ERROR',
              item_id: item.id,
              day: day.date,
              message: `POI "${item.location_ref.name}" 在 ${day.date} ${item.start_window} 可能未开放`,
              suggestion: openingHours ? `建议调整到开放时间：${openingHours}` : '请检查该地点的开放时间',
              violation: {
                anchor: { constraintId: CONSTRAINT_IDS.ENTITY_OPENING_HOURS_OVERLAP, ruleId: 'temporal_opening_v1' },
                entityRef: { type: 'POI', id: item.id },
                evidence: {
                  source: 'OPENING_HOURS',
                },
                scope: 'LOCAL',
              },
            });
          } else if (openingHours && typeof openingHours === 'string') {
            // 尝试解析开放时间字符串并验证
            const hoursStr = openingHours;
            const checkDate = startTime.toJSDate();
            const timezone = 'UTC'; // 默认 UTC，实际应该从 POI 元数据获取
            
            if (!OpeningHoursUtil.isOpenAt(hoursStr, checkDate, timezone)) {
              // Best-effort dual-lemma metric inference, only when evidence carries explicit window.
              const inferred = this.inferOpenCloseMinutes(openingHoursInfo, dayDate);
              const startMin = Math.round(startTime.diff(dayDate.startOf('day'), 'minutes').minutes);
              const endMin = Math.round(endTime.diff(dayDate.startOf('day'), 'minutes').minutes);
              const metric: ConstraintViolation['metric'] | undefined = inferred
                ? (() => {
                    const { openMin, closeMin } = inferred;
                    // If start < open => GEQ lemma violated (slack = actual - limit)
                    if (startMin < openMin) {
                      return { cmp: 'GEQ', actual: startMin, limit: openMin, unit: 'min', slack: startMin - openMin };
                    }
                    // If end > close => LEQ lemma violated (slack = limit - actual)
                    if (endMin > closeMin) {
                      return { cmp: 'LEQ', actual: endMin, limit: closeMin, unit: 'min', slack: closeMin - endMin };
                    }
                    return undefined;
                  })()
                : undefined;
              issues.push({
                type: 'OPENING_HOURS_CONFLICT',
                severity: 'ERROR',
                item_id: item.id,
                day: day.date,
                message: `POI "${item.location_ref.name}" 在 ${item.start_window} 不在开放时间内`,
                suggestion: `开放时间：${hoursStr}`,
                violation: {
                  anchor: { constraintId: CONSTRAINT_IDS.ENTITY_OPENING_HOURS_OVERLAP, ruleId: 'temporal_opening_v1' },
                  entityRef: { type: 'POI', id: item.id },
                  ...(metric ? { metric } : {}),
                  evidence: {
                    source: 'OPENING_HOURS',
                  },
                  scope: 'LOCAL',
                },
              });
            }
          }
        }
      }
    }
  }

  private inferOpenCloseMinutes(
    openingHoursInfo: any,
    dayDate: DateTime,
  ): { openMin: number; closeMin: number } | undefined {
    // Accept a few common evidence shapes:
    // - { open_min: number, close_min: number }
    // - { open_time: "HH:mm", close_time: "HH:mm" }
    const openMin = typeof openingHoursInfo?.open_min === 'number' ? openingHoursInfo.open_min : undefined;
    const closeMin = typeof openingHoursInfo?.close_min === 'number' ? openingHoursInfo.close_min : undefined;
    if (Number.isFinite(openMin) && Number.isFinite(closeMin)) {
      return { openMin: Math.round(openMin), closeMin: Math.round(closeMin) };
    }
    const openTime = typeof openingHoursInfo?.open_time === 'string' ? openingHoursInfo.open_time : undefined;
    const closeTime = typeof openingHoursInfo?.close_time === 'string' ? openingHoursInfo.close_time : undefined;
    if (openTime && closeTime) {
      const o = this.parseTimeWindow(openTime, dayDate);
      const c = this.parseTimeWindow(closeTime, dayDate);
      if (o && c) {
        const oMin = Math.round(o.diff(dayDate.startOf('day'), 'minutes').minutes);
        const cMin = Math.round(c.diff(dayDate.startOf('day'), 'minutes').minutes);
        if (Number.isFinite(oMin) && Number.isFinite(cMin)) return { openMin: oMin, closeMin: cMin };
      }
    }
    return undefined;
  }

  /**
   * 验证换乘 buffer
   */
  private verifyTransferBuffers(
    itinerary: Itinerary,
    issues: ItineraryVerifyOutput['issues'],
  ): void {
    const MIN_TRANSFER_BUFFER_MINUTES = 30; // 最小换乘缓冲时间（分钟）

    for (const day of itinerary.days) {
      const items = day.items.filter(item => item.type !== 'REST');
      
      for (let i = 0; i < items.length - 1; i++) {
        const currentItem = items[i];
        const nextItem = items[i + 1];

        if (currentItem.type === 'TRANSIT' || nextItem.type === 'TRANSIT') {
          // 检查换乘时间
          const currentEnd = this.parseTimeWindow(currentItem.end_window, DateTime.fromISO(day.date));
          const nextStart = this.parseTimeWindow(nextItem.start_window, DateTime.fromISO(day.date));

          if (currentEnd && nextStart) {
            const bufferMinutes = nextStart.diff(currentEnd, 'minutes').minutes;

            if (bufferMinutes < MIN_TRANSFER_BUFFER_MINUTES) {
              issues.push({
                type: 'TRANSFER_BUFFER_INSUFFICIENT',
                severity: bufferMinutes < 15 ? 'ERROR' : 'WARNING',
                item_id: nextItem.id,
                day: day.date,
                message: `换乘时间不足：从 "${currentItem.location_ref?.name || '上一站'}" 到 "${nextItem.location_ref?.name || '下一站'}" 只有 ${Math.round(bufferMinutes)} 分钟`,
                suggestion: `建议至少预留 ${MIN_TRANSFER_BUFFER_MINUTES} 分钟换乘时间`,
                violation: {
                  anchor: { constraintId: CONSTRAINT_IDS.TIME_SPACE_MIN_TRANSFER_BUFFER, ruleId: 'itinerary.verify:transfer_buffer' },
                  entityRef: { type: 'SEGMENT', id: `${day.date}|${currentItem.id}->${nextItem.id}` },
                  metric: {
                    cmp: 'GEQ',
                    actual: Math.max(0, Math.round(bufferMinutes)),
                    limit: MIN_TRANSFER_BUFFER_MINUTES,
                    unit: 'min',
                    slack: Math.round(bufferMinutes) - MIN_TRANSFER_BUFFER_MINUTES,
                  },
                  evidence: { source: 'RULE' },
                  scope: 'LOCAL',
                  suggestedActions: [
                    { action: 'RELAX', detail: 'insert buffer / reduce stay time at previous item' },
                    { action: 'REORDER', detail: 'swap items to increase transfer slack' },
                  ],
                },
              });
            }
          }
        }
      }
    }
  }

  /**
   * `research_data.safetravel_alerts`：封路 / 极端天气等与路段 ref 对齐时阻断可达性。
   */
  private verifySafetravelRouteAlerts(
    itinerary: Itinerary,
    researchData: Record<string, any> | undefined,
    issues: ItineraryVerifyOutput['issues'],
  ): void {
    const raw = researchData?.safetravel_alerts;
    if (!raw) return;

    const alerts: SafetravelRouteAlertEvidence[] = Array.isArray(raw) ? raw : raw.alerts ?? [];
    if (!Array.isArray(alerts) || alerts.length === 0) return;

    const affectedRefs = new Set<string>();
    for (const a of alerts) {
      const refs = a?.affected_route_segment_refs;
      if (!Array.isArray(refs)) continue;
      for (const r of refs) {
        if (typeof r === 'string' && r.length > 0) affectedRefs.add(r);
      }
    }
    if (affectedRefs.size === 0) return;

    const alertByRef = new Map<string, SafetravelRouteAlertEvidence>();
    for (const a of alerts) {
      if (!Array.isArray(a?.affected_route_segment_refs)) continue;
      for (const r of a.affected_route_segment_refs) {
        if (typeof r === 'string') alertByRef.set(r, a);
      }
    }

    const severityFromAlert = (a: SafetravelRouteAlertEvidence): 'CRITICAL' | 'ERROR' | 'WARNING' => {
      const s = (a.severity ?? 'critical').toString().trim().toLowerCase();
      if (s === 'critical') return 'CRITICAL';
      if (s === 'high' || s === 'error') return 'ERROR';
      return 'WARNING';
    };

    for (const day of itinerary.days) {
      for (const item of day.items) {
        const seg = item.metadata?.route_segment_ref;
        if (!seg || !affectedRefs.has(seg)) continue;
        const alert = alertByRef.get(seg);
        const summary = alert?.summary ?? 'Route segment affected by travel safety alert';
        const title = alert?.title ? `${alert.title}: ` : '';
        const message = `${title}${summary}`.trim();
        const issueSev = alert ? severityFromAlert(alert) : 'ERROR';

        issues.push({
          type: 'REACHABILITY_ISSUE',
          severity: issueSev,
          item_id: item.id,
          day: day.date,
          message,
          suggestion:
            'Road segment unsafe or closed — replan route (detour), delay leg, or stay overnight before crossing; do not assume Ring Road passage.',
          violation: {
            anchor: {
              constraintId: CONSTRAINT_IDS.ENVIRONMENT_EXTREME_WEATHER_CLOSURE,
              ruleId: 'itinerary.verify:safetravel_route_segment_v1',
            },
            entityRef: { type: 'SEGMENT', id: seg },
            evidence: {
              source: 'WEATHER',
              refIds: alert?.id ? [String(alert.id)] : undefined,
            },
            scope: 'GLOBAL',
            suggestedActions: [
              { action: 'REPLACE', detail: 'Use inland detour or wait for reopening per SafeTravel' },
              { action: 'ASK_USER', detail: 'Confirm willingness to skip Jökulsárlón leg or extend stay' },
            ],
          },
        });
      }
    }
  }

  /**
   * 验证可达性
   */
  private verifyReachability(
    itinerary: Itinerary,
    researchData: Record<string, any> | undefined,
    issues: ItineraryVerifyOutput['issues'],
  ): void {
    const transportEvidence = researchData?.transport_evidence;
    if (!transportEvidence) {
      // 没有交通证据，跳过验证
      return;
    }

    // 检查交通选项是否可用
    if (transportEvidence.options && Array.isArray(transportEvidence.options)) {
      const hasValidOption = transportEvidence.options.some((option: any) => 
        option.duration_minutes && option.duration_minutes > 0
      );

      if (!hasValidOption) {
        issues.push({
          type: 'REACHABILITY_ISSUE',
          severity: 'ERROR',
          message: '未找到可行的交通路线',
          suggestion: '请检查起点和终点的可达性',
        });
      }
    }
  }

  /**
   * 验证疲劳阈值
   */
  private verifyFatigueThresholds(
    itinerary: Itinerary,
    issues: ItineraryVerifyOutput['issues'],
  ): void {
    const MAX_DAILY_WALK_KM = 15; // 最大每日步行距离（公里）
    const MAX_DAILY_ACTIVITY_HOURS = 10; // 最大每日活动时间（小时）

    for (const day of itinerary.days) {
      let totalWalkDistance = 0;
      let totalActivityMinutes = 0;

      for (const item of day.items) {
        // 计算步行距离（如果有元数据）
        if (item.type === 'WALK' && item.metadata?.distance_meters) {
          totalWalkDistance += item.metadata.distance_meters / 1000; // 转换为公里
        }

        // 计算活动时间
        if (item.type !== 'REST' && item.metadata?.duration_minutes) {
          totalActivityMinutes += item.metadata.duration_minutes;
        } else if (item.start_window && item.end_window) {
          const start = this.parseTimeWindow(item.start_window, DateTime.fromISO(day.date));
          const end = this.parseTimeWindow(item.end_window, DateTime.fromISO(day.date));
          if (start && end) {
            totalActivityMinutes += end.diff(start, 'minutes').minutes;
          }
        }
      }

      // 检查步行距离
      if (totalWalkDistance > MAX_DAILY_WALK_KM) {
        issues.push({
          type: 'FATIGUE_THRESHOLD_EXCEEDED',
          severity: 'WARNING',
          day: day.date,
          message: `每日步行距离 ${totalWalkDistance.toFixed(1)} 公里超过建议值 ${MAX_DAILY_WALK_KM} 公里`,
          suggestion: '建议减少步行距离或增加休息时间',
        });
      }

      // 检查活动时间
      const totalActivityHours = totalActivityMinutes / 60;
      if (totalActivityHours > MAX_DAILY_ACTIVITY_HOURS) {
        issues.push({
          type: 'FATIGUE_THRESHOLD_EXCEEDED',
          severity: 'WARNING',
          day: day.date,
          message: `每日活动时间 ${totalActivityHours.toFixed(1)} 小时超过建议值 ${MAX_DAILY_ACTIVITY_HOURS} 小时`,
          suggestion: '建议减少活动数量或增加休息时间',
        });
      }
    }
  }

  /**
   * 验证时间窗重叠
   */
  private verifyTimeWindowOverlaps(
    itinerary: Itinerary,
    issues: ItineraryVerifyOutput['issues'],
  ): void {
    for (const day of itinerary.days) {
      const items = day.items.filter(item => item.type !== 'REST');
      const dayDate = DateTime.fromISO(day.date);

      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          const item1 = items[i];
          const item2 = items[j];

          const start1 = this.parseTimeWindow(item1.start_window, dayDate);
          const end1 = this.parseTimeWindow(item1.end_window, dayDate);
          const start2 = this.parseTimeWindow(item2.start_window, dayDate);
          const end2 = this.parseTimeWindow(item2.end_window, dayDate);

          if (start1 && end1 && start2 && end2) {
            // 检查是否重叠
            if (start1 < end2 && start2 < end1) {
              issues.push({
                type: 'TIME_WINDOW_OVERLAP',
                severity: 'ERROR',
                item_id: item2.id,
                related_item_id: item1.id,
                day: day.date,
                message: `时间窗重叠：${item1.location_ref?.name || '活动1'} 和 ${item2.location_ref?.name || '活动2'} 的时间窗重叠`,
                suggestion: '请调整其中一个活动的时间',
              });
            }
          }
        }
      }
    }
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
