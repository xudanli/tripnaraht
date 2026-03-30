// src/agent/services/sub-agents/gatekeeper-agent.service.ts

import { Injectable, Logger, Optional } from '@nestjs/common';
import { GatekeeperAgent } from '../../interfaces/sub-agent.interface';
import { TripPlanRequest, OrchestratorState, GateResult } from '../../interfaces/trip-plan.interface';
import { PlanGateRunThreeGuardiansSkill } from '../../../skills/plan/gate/plan-gate-run-three-guardians.skill';
import { PlanGatePrecheckSkill } from '../../../skills/plan/gate/plan-gate-precheck.skill';
import { FRoadCheckSkill } from '../../../skills/world/f-road-check.skill';
import { WeatherAlertSkill } from '../../../skills/world/weather-alert.skill';
import { AvalancheRiskAssessmentSkill } from '../../../skills/world/avalanche-risk-assessment.skill';

/**
 * Gatekeeper Agent Service (Claude Orchestration)
 *
 * 职责：Should-Exist Gate 规则执行（硬门控+软评分）
 *
 * 强制：Gate 在 Plan 之前执行
 *
 * 执行顺序:
 * Step 0: F-Road 检查（冰岛特定）
 * Step 0.5: 天气告警检查（冰岛特定）
 * Step 0.6: 雪崩风险评估（冰岛特定）
 * Step 1: 硬门控检查
 * Step 2: 快速预检查
 * Step 3: 三人格评审
 * Step 4: 软评分检查
 */
@Injectable()
export class ClaudeGatekeeperAgentService implements GatekeeperAgent {
  private readonly logger = new Logger(ClaudeGatekeeperAgentService.name);

  constructor(
    @Optional() private readonly gateRunThreeGuardians?: PlanGateRunThreeGuardiansSkill,
    @Optional() private readonly gatePrecheck?: PlanGatePrecheckSkill,
    @Optional() private readonly fRoadCheck?: FRoadCheckSkill,
    @Optional() private readonly weatherAlert?: WeatherAlertSkill,
    @Optional() private readonly avalancheRisk?: AvalancheRiskAssessmentSkill,
  ) {
    this.logger.log(`[GatekeeperAgent] 已初始化`);
    this.logger.log(`[GatekeeperAgent] GateRunThreeGuardians: ${!!this.gateRunThreeGuardians}, GatePrecheck: ${!!this.gatePrecheck}, FRoadCheck: ${!!this.fRoadCheck}, WeatherAlert: ${!!this.weatherAlert}, AvalancheRisk: ${!!this.avalancheRisk}`);
  }

  /**
   * 执行 Should-Exist Gate 评估
   */
  async evaluateGate(
    request: TripPlanRequest,
    researchData: Record<string, any>,
    _context: OrchestratorState,
  ): Promise<GateResult> {
    this.logger.debug(`[GatekeeperAgent] 执行 Gate 评估: request_id=${request.request_id}`);

    try {
      // 0. 检查冰岛 F-road 状态（冰岛特定检查）
      if (this.fRoadCheck && this.isIcelandTrip(request)) {
        this.logger.debug(`[GatekeeperAgent] 检测到冰岛行程，执行 F-Road 检查`);
        const fRoadResult = await this.fRoadCheck.execute({
          request_id: request.request_id,
          destination: this.toLocationString(request.destination) || '',
          origin: this.toLocationString(request.origin),
          date_range: request.date_range,
        });

        // 如果有道路关闭，直接返回 BLOCK
        if (!fRoadResult.can_proceed) {
          this.logger.warn(`[GatekeeperAgent] F-Road 检查失败: ${fRoadResult.blocked_roads.length} 条道路关闭`);
          return {
            gate_result: 'BLOCK',
            violations: fRoadResult.blocked_roads.map(r => ({
              type: 'REACHABILITY' as const,
              severity: 'HARD' as const,
              detail: `${r.roadId} is ${r.currentStatus}: ${r.reason}${r.unverified ? ' (UNVERIFIED - requires manual verification)' : ''}`,
            })),
            required_adjustments: (fRoadResult.alternative_routes || []).map(alt => ({
              action: 'REPLACE_SEGMENT' as const,
              why: alt,
            })),
            confidence: 0.9,
            evidence_refs: fRoadResult.evidence_refs.map(ref => ({
              evidence_id: ref.evidence_id,
              source: ref.source,
              last_verified_at: ref.last_verified_at.toISOString(),
              confidence: ref.confidence,
            } as any)),
          };
        }

        // 如果有告警，记录为软检查
        if ((fRoadResult.warnings && fRoadResult.warnings.length > 0) ||
            (fRoadResult.required_actions && fRoadResult.required_actions.length > 0)) {
          this.logger.warn(`[GatekeeperAgent] F-Road 检查告警: ${fRoadResult.warnings?.length || 0} 条`);
          if (fRoadResult.warnings) {
            researchData.f_road_warnings = fRoadResult.warnings;
          }
          if (fRoadResult.required_actions) {
            researchData.f_road_required_actions = fRoadResult.required_actions;
          }
          if (fRoadResult.evidence_refs) {
            researchData.f_road_evidence_refs = fRoadResult.evidence_refs;
          }
        }
      }

      // 0.5 检查冰岛天气条件（冰岛特定检查）
      if (this.weatherAlert && this.isIcelandTrip(request)) {
        this.logger.debug(`[GatekeeperAgent] 检测到冰岛行程，执行天气告警检查`);

        // 提取行程位置
        const locations: Array<{ lat: number; lng: number; name?: string; type?: 'start' | 'end' | 'waypoint' }> = [];

        // 添加起点
        if (request.origin) {
          locations.push({
            lat: typeof request.origin === 'string' ? 0 : request.origin.lat,
            lng: typeof request.origin === 'string' ? 0 : request.origin.lng,
            name: typeof request.origin === 'string' ? request.origin : '起点',
            type: 'start' as const,
          });
        }

        // 添加终点
        if (request.destination) {
          locations.push({
            lat: typeof request.destination === 'string' ? 0 : request.destination.lat,
            lng: typeof request.destination === 'string' ? 0 : request.destination.lng,
            name: typeof request.destination === 'string' ? request.destination : '终点',
            type: 'end' as const,
          });
        }

        // 转换日期范围
        let dateRange: { start: Date; end: Date };
        if (request.date_range) {
          if ('start' in request.date_range && 'end' in request.date_range) {
            dateRange = request.date_range as { start: Date; end: Date };
          } else if ('start_date' in request.date_range && 'end_date' in request.date_range) {
            dateRange = {
              start: new Date(request.date_range.start_date),
              end: new Date(request.date_range.end_date),
            };
          } else {
            dateRange = {
              start: new Date(),
              end: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            };
          }
        } else {
          dateRange = {
            start: new Date(),
            end: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          };
        }

        // 执行天气检查
        try {
          const weatherResult = await this.weatherAlert.execute({
            locations: locations.length > 0 ? locations : [
              { lat: 64.1466, lng: -21.9426, name: 'Reykjavík', type: 'start' },
              { lat: 64.75, lng: -18.0, name: 'Highlands', type: 'end' },
            ],
            dateRange,
            riskTolerance: 'medium',
          });

          // 如果天气条件极端，直接返回 BLOCK
          if (weatherResult.gateRecommendation === 'BLOCK') {
            this.logger.warn(`[GatekeeperAgent] 天气检查 BLOCK: ${weatherResult.overallRisk}`);
            return {
              gate_result: 'BLOCK',
              violations: weatherResult.locationWeather.flatMap(lw =>
                lw.blockers.map(b => ({
                  type: 'SAFETY' as const,
                  severity: 'HARD' as const,
                  detail: `${lw.location.name}: ${b}`,
                }))
              ),
              required_adjustments: weatherResult.adjustments.map(adj => ({
                action: 'CHANGE_DATES' as const,
                why: adj,
              })),
              confidence: weatherResult.evidenceRefs[0]?.confidence || 0.8,
              evidence_refs: weatherResult.evidenceRefs.map(ref => ({
                evidence_id: ref.location,
                source: ref.source,
                last_verified_at: ref.timestamp.toISOString(),
                confidence: ref.confidence,
              } as any)),
            };
          }

          // 记录天气结果用于软检查
          researchData.weather_alert_result = weatherResult;
          researchData.weather_gate_recommendation = weatherResult.gateRecommendation;

          if (weatherResult.gateRecommendation === 'ADJUST_REQUIRED' ||
              weatherResult.gateRecommendation === 'NEED_USER_CONFIRM') {
            this.logger.warn(`[GatekeeperAgent] 天气检查告警: ${weatherResult.summary}`);
          }
        } catch (weatherError: any) {
          this.logger.warn(`[GatekeeperAgent] 天气检查出错 (降级处理): ${weatherError?.message}`);
          // 天气检查失败不应该阻止行程，只是记录
          researchData.weather_check_failed = true;
          researchData.weather_check_error = weatherError?.message;
        }
      }

      // 0.6 检查冰岛雪崩风险（冰岛特定检查）
      if (this.avalancheRisk && this.isIcelandTrip(request)) {
        this.logger.debug(`[GatekeeperAgent] 检测到冰岛行程，执行雪崩风险评估`);

        try {
          // 提取路线点
          const routePoints: Array<{ lat: number; lng: number; name?: string }> = [];

          // 添加起点
          if (request.origin) {
            routePoints.push({
              lat: typeof request.origin === 'string' ? 0 : request.origin.lat,
              lng: typeof request.origin === 'string' ? 0 : request.origin.lng,
              name: typeof request.origin === 'string' ? request.origin : '起点',
            });
          }

          // 添加终点
          if (request.destination) {
            routePoints.push({
              lat: typeof request.destination === 'string' ? 0 : request.destination.lat,
              lng: typeof request.destination === 'string' ? 0 : request.destination.lng,
              name: typeof request.destination === 'string' ? request.destination : '终点',
            });
          }

          // 提取月份
          let month = new Date().getMonth() + 1; // 默认当前月份
          if (request.date_range) {
            if ('start' in request.date_range && request.date_range.start instanceof Date) {
              month = (request.date_range.start as Date).getMonth() + 1;
            } else if ('start_date' in request.date_range) {
              const startDate = new Date(request.date_range.start_date);
              month = startDate.getMonth() + 1;
            }
          } else if (request.start_date) {
            const startDate = new Date(request.start_date);
            month = startDate.getMonth() + 1;
          }

          // 转换日期范围
          let dateRangeForAvalanche: { start: Date; end: Date } | undefined;
          if (request.date_range) {
            if ('start' in request.date_range && request.date_range.start instanceof Date) {
              dateRangeForAvalanche = {
                start: request.date_range.start as Date,
                end: (request.date_range as any).end as Date,
              };
            } else if ('start_date' in request.date_range) {
              dateRangeForAvalanche = {
                start: new Date(request.date_range.start_date),
                end: new Date(request.date_range.end_date),
              };
            }
          }

          // 执行雪崩风险评估
          const avalancheResult = await this.avalancheRisk.execute({
            request_id: request.request_id,
            route: routePoints.length > 0 ? routePoints : [
              { lat: 64.1466, lng: -21.9426, name: 'Reykjavík' },
              { lat: 64.75, lng: -18.0, name: 'Highlands' },
            ],
            countryCode: 'IS',
            month,
            dateRange: dateRangeForAvalanche,
            riskTolerance: (request.party_profile as any)?.risk_tolerance || 'MEDIUM',
          });

          // 如果雪崩风险评估建议 BLOCK，直接返回
          if (avalancheResult.gateRecommendation === 'BLOCK') {
            this.logger.warn(`[GatekeeperAgent] 雪崩风险评估 BLOCK: ${avalancheResult.overallRisk}`);
            return {
              gate_result: 'BLOCK',
              violations: avalancheResult.blockers.map(blocker => ({
                type: 'SAFETY' as const,
                severity: 'HARD' as const,
                detail: blocker,
              })),
              required_adjustments: avalancheResult.adjustments.map(adj => ({
                action: 'CHANGE_DATES' as const,
                why: adj,
              })),
              confidence: 0.9,
              evidence_refs: avalancheResult.evidence_refs.map(ref => ({
                evidence_id: ref.evidence_id,
                source: ref.source,
                last_verified_at: ref.last_verified_at,
                confidence: ref.confidence,
              } as any)),
            };
          }

          // 记录雪崩风险结果用于软检查
          researchData.avalanche_risk_result = avalancheResult;
          researchData.avalanche_gate_recommendation = avalancheResult.gateRecommendation;
          researchData.avalanche_hazard_zones = avalancheResult.hazardZones;
          researchData.avalanche_evidence_refs = avalancheResult.evidence_refs;

          if (avalancheResult.gateRecommendation === 'ADJUST_REQUIRED' ||
              avalancheResult.gateRecommendation === 'NEED_USER_CONFIRM') {
            this.logger.warn(`[GatekeeperAgent] 雪崩风险评估告警: ${avalancheResult.summary}`);
            if (avalancheResult.warnings.length > 0) {
              researchData.avalanche_warnings = avalancheResult.warnings;
            }
            if (avalancheResult.adjustments.length > 0) {
              researchData.avalanche_adjustments = avalancheResult.adjustments;
            }
          }
        } catch (avalancheError: any) {
          this.logger.warn(`[GatekeeperAgent] 雪崩风险评估出错 (降级处理): ${avalancheError?.message}`);
          // 雪崩检查失败不应该阻止行程，只是记录
          researchData.avalanche_check_failed = true;
          researchData.avalanche_check_error = avalancheError?.message;
        }
      }

      // 1. 硬门控检查（快速失败）
      const hardGateResult = this.checkHardGate(request, researchData);
      if (!hardGateResult.allowed) {
        return {
          gate_result: 'BLOCK',
          violations: hardGateResult.violations.map(v => ({
            type: this.mapViolationType(v),
            severity: 'HARD' as const,
            detail: v,
          })),
          required_adjustments: [],
          confidence: 0.9,
          evidence_refs: [],
        };
      }

      // 2. 如果有 gatePrecheck，执行快速预检查
      if (this.gatePrecheck) {
        // TODO: 将 request 转换为 PlanState 格式
        // const precheckResult = await this.gatePrecheck.execute({ planState, tripId: context.request_id });
        // 如果预检查失败，直接返回
      }

      // 3. 如果有 gateRunThreeGuardians，执行三人格评审
      if (this.gateRunThreeGuardians) {
        // TODO: 将 request 转换为 PlanState 格式
        // const guardiansResult = await this.gateRunThreeGuardians.execute({ planState, tripId: context.request_id });
        // 将 GateStatus 转换为 GateResult
      }

      // 4. 软评分检查（基于 researchData）
      const softChecks = this.performSoftChecks(request, researchData);

      // 5. 生成 GateResult
      const gateResult: GateResult = {
        gate_result: softChecks.hasAdjustments ? 'ADJUST_REQUIRED' : 'ALLOW',
        violations: softChecks.violations,
        required_adjustments: softChecks.adjustments,
        confidence: softChecks.confidence,
        evidence_refs: this.extractEvidenceRefs(researchData),
      };

      this.logger.log(`[GatekeeperAgent] Gate 评估完成: ${gateResult.gate_result}, 置信度: ${gateResult.confidence}`);

      return gateResult;
    } catch (error: any) {
      this.logger.error(`[GatekeeperAgent] Gate 评估失败: ${error?.message}`, error?.stack);

      // 降级：返回需要用户确认
      return {
        gate_result: 'NEED_USER_CONFIRM',
        violations: [{
          type: 'DATA_MISSING',
          severity: 'SOFT',
          detail: `Gate 评估失败: ${error?.message || '未知错误'}`,
        }],
        required_adjustments: [],
        confidence: 0.3,
        evidence_refs: [],
      };
    }
  }

  /**
   * 硬门控检查
   */
  private checkHardGate(
    request: TripPlanRequest,
    researchData: Record<string, any>,
  ): { allowed: boolean; violations: string[] } {
    const violations: string[] = [];

    // 检查必需字段
    if (!request.destination) {
      violations.push('缺少目的地（destination）');
    }

    if (!request.date_range && !request.start_date) {
      violations.push('缺少日期信息（date_range 或 start_date）');
    }

    // 检查可达性证据
    if (researchData.transport_evidence && Array.isArray(researchData.transport_evidence)) {
      if (researchData.transport_evidence.length === 0) {
        violations.push('起点/终点不可达（无交通证据）');
      }
    }

    // 检查高风险区域
    if (researchData.risk_assessment?.risk_level === 'CRITICAL') {
      violations.push('关键路段高风险（risk_level=CRITICAL）');
    }

    return {
      allowed: violations.length === 0,
      violations,
    };
  }

  /**
   * 软评分检查
   */
  private performSoftChecks(
    request: TripPlanRequest,
    researchData: Record<string, any>,
  ): {
    hasAdjustments: boolean;
    violations: GateResult['violations'];
    adjustments: GateResult['required_adjustments'];
    confidence: number;
  } {
    const violations: GateResult['violations'] = [];
    const adjustments: GateResult['required_adjustments'] = [];
    let confidence = 0.8;

    // 检查疲劳
    if (researchData.fatigue_estimate?.daily_fatigue_score > 0.8) {
      violations.push({
        type: 'FATIGUE',
        severity: 'SOFT',
        detail: `每日疲劳评分过高: ${researchData.fatigue_estimate.daily_fatigue_score}`,
      });
      adjustments.push({
        action: 'SHORTEN_DAY',
        why: '每日疲劳评分超过阈值，建议缩短每日行程',
      });
      confidence -= 0.1;
    }

    // 检查 DEM（累计爬升）
    if (researchData.dem_metrics) {
      const maxAscent = request.constraints?.max_ascent_m;
      if (maxAscent && researchData.dem_metrics.total_ascent_m > maxAscent) {
        violations.push({
          type: 'DEM',
          severity: 'SOFT',
          detail: `累计爬升超出限制: ${researchData.dem_metrics.total_ascent_m}m > ${maxAscent}m`,
        });
        adjustments.push({
          action: 'REPLACE_SEGMENT',
          why: '累计爬升超出用户能力，建议替换为更平缓的路段',
        });
        confidence -= 0.1;
      }
    }

    // 检查开放时间冲突
    if (researchData.opening_hours_evidence) {
      // TODO: 检查开放时间冲突
    }

    // 检查雪崩风险（来自 Step 0.6）
    if (researchData.avalanche_gate_recommendation === 'ADJUST_REQUIRED') {
      violations.push({
        type: 'SAFETY',
        severity: 'SOFT',
        detail: `雪崩风险需要调整: ${researchData.avalanche_risk_result?.summary || '路线存在雪崩风险'}`,
      });

      // 添加雪崩相关的调整建议
      if (researchData.avalanche_risk_result?.adjustments) {
        for (const adjustment of researchData.avalanche_risk_result.adjustments) {
          adjustments.push({
            action: 'CHANGE_DATES',
            why: adjustment,
          });
        }
      }
      confidence -= 0.15;
    } else if (researchData.avalanche_gate_recommendation === 'NEED_USER_CONFIRM') {
      violations.push({
        type: 'SAFETY',
        severity: 'SOFT',
        detail: `雪崩风险需要用户确认: ${researchData.avalanche_risk_result?.summary || '路线可能存在雪崩风险'}`,
      });
      confidence -= 0.05;
    }

    // 检查雪崩警告（即使建议是 ALLOW，也可能有警告）
    if (researchData.avalanche_warnings && Array.isArray(researchData.avalanche_warnings)) {
      for (const warning of researchData.avalanche_warnings) {
        violations.push({
          type: 'SAFETY',
          severity: 'SOFT',
          detail: `雪崩风险警告: ${warning}`,
        });
      }
    }

    return {
      hasAdjustments: adjustments.length > 0,
      violations,
      adjustments,
      confidence: Math.max(0.1, confidence),
    };
  }

  /**
   * 提取证据引用
   */
  private extractEvidenceRefs(researchData: Record<string, any>): string[] {
    const evidenceRefs: string[] = [];

    if (researchData.transport_evidence && Array.isArray(researchData.transport_evidence)) {
      evidenceRefs.push(...researchData.transport_evidence.map((e: any) => e.evidence_id || e.id).filter(Boolean));
    }

    if (researchData.poi_evidence && Array.isArray(researchData.poi_evidence)) {
      evidenceRefs.push(...researchData.poi_evidence.map((e: any) => e.evidence_id || e.id).filter(Boolean));
    }

    if (researchData.opening_hours_evidence && Array.isArray(researchData.opening_hours_evidence)) {
      evidenceRefs.push(...researchData.opening_hours_evidence.map((e: any) => e.evidence_id || e.id).filter(Boolean));
    }

    // 添加雪崩风险证据
    if (researchData.avalanche_evidence_refs && Array.isArray(researchData.avalanche_evidence_refs)) {
      evidenceRefs.push(...researchData.avalanche_evidence_refs.map((e: any) => e.evidence_id || e.id).filter(Boolean));
    }

    return evidenceRefs;
  }

  /**
   * 映射违规类型
   */
  private mapViolationType(violation: string): GateResult['violations'][0]['type'] {
    if (violation.includes('不可达') || violation.includes('交通')) {
      return 'REACHABILITY';
    }
    if (violation.includes('风险') || violation.includes('安全')) {
      return 'SAFETY';
    }
    if (violation.includes('DEM') || violation.includes('爬升')) {
      return 'DEM';
    }
    if (violation.includes('缺失') || violation.includes('缺少')) {
      return 'DATA_MISSING';
    }
    return 'DATA_MISSING'; // 默认
  }

  /**
   * 检查是否为冰岛行程
   */
  private isIcelandTrip(request: TripPlanRequest): boolean {
    // 检查字符串地址
    const destination = typeof request.destination === 'string'
      ? request.destination.toLowerCase()
      : '';
    const origin = request.origin && typeof request.origin === 'string'
      ? request.origin.toLowerCase()
      : '';

    // 字符串检查
    const stringCheck = destination.includes('iceland') ||
           destination.includes('冰岛') ||
           origin.includes('iceland') ||
           origin.includes('冰岛') ||
           /F\d{1,3}/i.test(destination) ||
           /F\d{1,3}/i.test(origin);

    if (stringCheck) return true;

    // 坐标检查：冰岛边界 (63°N-67°N, 13°W-25°W)
    // 冰岛坐标范围: lat 63-67, lng -25 to -13
    const isIcelandCoord = (loc: { lat: number; lng: number }) =>
      loc.lat >= 63 && loc.lat <= 67 && loc.lng >= -25 && loc.lng <= -13;

    if (request.destination && typeof request.destination !== 'string') {
      if (isIcelandCoord(request.destination)) return true;
    }

    if (request.origin && typeof request.origin !== 'string') {
      if (isIcelandCoord(request.origin)) return true;
    }

    return false;
  }

  /**
   * 将 TripPlanRequest 的 destination/origin 转换为字符串
   */
  private toLocationString(location: string | { lat: number; lng: number } | undefined): string | undefined {
    if (!location) return undefined;
    if (typeof location === 'string') return location;
    return `${location.lat},${location.lng}`;
  }
}
