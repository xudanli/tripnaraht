// src/trips/decision/strategies/neptune-strategy.service.ts
/**
 * Neptune Strategy（空间修复者）
 * 
 * 第一性原理：必须强依赖 RoutePhilosophy + PhysicalReality
 * 
 * 法律：
 * ✔ 可以 REPLACE
 * ❌ 不得忽略硬约束
 * ❌ 不得改变 RouteDirection 哲学
 * 
 * Neptune 只能做三件事：
 * 1. 换入口 / 换节点 / 换局部走廊（REPLACE）
 * 2. 保持 RouteDirection 不变
 * 3. 永远不突破硬约束（Abu 的法律）
 * 
 * 不能做的事：
 * ❌ 不能把"冰岛高地 F 路探险"换成"环岛一号公路"
 * ❌ 不能帮用户偷偷忽略封路 / 禁止入内
 * ❌ 不能在没有 DEM / 无证据的地方瞎修
 * 
 * Neptune 是"路线哲学的守护者 + 空间补丁的作者"。
 * 
 * 第一性原理要求：
 * - 空间约束：所有替代点/替代段必须在 corridorGeom 缓冲范围内或 regions 指定的区域内
 * - 哲学约束：
 *   - 不允许删掉 philosophy.mustVisitTags 对应的体验
 *   - 不允许跨越 nonNegotiableRules
 * - 替换前 check：不会违反 nonNegotiableRules
 * - 替换后 check：核心标签/体验仍然覆盖
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { DecisionPersonaStrategy } from './decision-persona-strategy.interface';
import {
  WorldModelContext,
  RoutePlanDraft,
  RouteSegment,
} from '../shared/world-model.types';
import { DecisionResult, DecisionAction, DecisionLogEntry, DecisionSource, DecisionStage } from '../shared/decision-result.types';
import { SpatialReplacementService } from '../services/spatial-replacement.service';
import { SpatialIssueDetectorService } from '../services/spatial-issue-detector.service';
import { SpatialIssue } from '../interfaces/spatial-issue.interface';
import { ReplacementOperation } from '../interfaces/replacement-candidate.interface';
import { RouteDirectionsService } from '../../../route-directions/route-directions.service';
import {
  validateReplacementAgainstPhilosophy,
  checkCoreExperienceCoverage,
} from '../models/route-philosophy.model';
import { RoutePhilosophy } from '../models/route-philosophy.model';
import { ExaIntegrationService } from '../../../mcp/exa-integration.service';
import { AirbnbIntegrationService } from '../../../mcp/airbnb-integration.service';
import { BookingComIntegrationService } from '../../../mcp/booking-com-integration.service';

@Injectable()
export class NeptuneStrategy implements DecisionPersonaStrategy {
  private readonly logger = new Logger(NeptuneStrategy.name);
  readonly personaName = 'NEPTUNE' as const;

  constructor(
    private readonly spatialReplacement: SpatialReplacementService,
    private readonly spatialIssueDetector: SpatialIssueDetectorService,
    @Optional() private readonly routeDirectionsService?: RouteDirectionsService,
    @Optional() private readonly exaIntegration?: ExaIntegrationService,
    @Optional() private readonly airbnbIntegration?: AirbnbIntegrationService,
    @Optional() private readonly bookingComIntegration?: BookingComIntegrationService,
  ) {}

  /**
   * 评估计划
   * 
   * Neptune 的职责：
   * 1. 检测空间问题（入口不可达、POI 不可用、路段阻塞等）
   * 2. 在同一走廊内替换入口点或局部路段
   * 3. 保持 RouteDirection 哲学不变
   */
  async evaluate(
    world: WorldModelContext,
    plan: RoutePlanDraft
  ): Promise<DecisionResult> {
    this.logger.debug(`Neptune 评估计划: ${plan.tripId}`);

    // 1️⃣ 检测空间问题（使用 SpatialIssueDetector + 补充检测）
    const detectedIssues = await this.spatialIssueDetector.detect(world, plan);
    const additionalIssues = await this.detectAdditionalSpatialIssues(world, plan);
    const spatialIssues = [...detectedIssues, ...additionalIssues];

    if (spatialIssues.length === 0) {
      return {
        allowed: true,
        action: 'ALLOW',
        updatedPlan: plan,
        logs: [
          {
            persona: 'NEPTUNE',
            action: 'ALLOW',
            explanation: '未发现空间层面的阻断或封闭问题',
            reasonCodes: [],
            evidenceRefs: [],
            timestamp: new Date().toISOString(),
            decisionSource: 'PHYSICAL',
            decisionStage: 'SPATIAL_REPAIR',
          },
        ],
      };
    }

    // 2️⃣ 获取 RouteDirection 信息（需要从数据库或上下文获取）
    const routeDirection = await this.getRouteDirection(plan.routeDirectionId);
    if (!routeDirection) {
      this.logger.warn(`无法获取 RouteDirection: ${plan.routeDirectionId}`);
      return {
        allowed: true,
        action: 'ALLOW',
        updatedPlan: plan,
        logs: [
          {
            persona: 'NEPTUNE',
            action: 'ALLOW',
            explanation: '无法获取路线方向信息，跳过空间修复',
            reasonCodes: ['MISSING_ROUTE_DIRECTION'],
            evidenceRefs: [],
            timestamp: new Date().toISOString(),
            decisionSource: 'HEURISTIC',
            decisionStage: 'SPATIAL_REPAIR',
          },
        ],
      };
    }

    // 3️⃣ 获取路线哲学（用于验证替换操作）
    const philosophy = this.extractRoutePhilosophy(routeDirection);

    // 4️⃣ 处理每个空间问题（带哲学约束）
    let currentPlan = { ...plan, segments: [...plan.segments] };
    const logs: DecisionLogEntry[] = [];
    let hasReplacement = false;

    for (const issue of spatialIssues) {
      const operation = await this.handleIssue(
        issue,
        world,
        currentPlan,
        routeDirection
      );

      if (!operation) {
        // 找不到合理替代：尝试使用 Exa 搜索实时替代方案
        const exaAlternative = await this.searchExaAlternatives(issue, world, routeDirection);
        
        if (exaAlternative) {
          // 使用 Exa 找到的替代方案
          logs.push({
            persona: 'NEPTUNE',
            action: 'REPLACE',
            explanation: `发现 ${issue.type}（${issue.reason}），通过实时信息搜索找到替代方案: ${exaAlternative.explanation}`,
            reasonCodes: ['EXA_ALTERNATIVE_FOUND'],
            evidenceRefs: [issue.issueId, exaAlternative.newPoiId || ''],
            timestamp: new Date().toISOString(),
            decisionSource: 'PHYSICAL',
            decisionStage: 'SPATIAL_REPAIR',
          });
          
          // 应用 Exa 替代方案（简化处理：记录日志，实际替换需要进一步处理）
          // TODO: 将 Exa 替代方案转换为 ReplacementOperation
          continue;
        }

        // 如果问题是住宿相关，尝试使用 Airbnb 搜索替代住宿
        if (issue.type === 'POI_UNAVAILABLE' && issue.poiId && issue.originalLocation) {
          const airbnbAlternative = await this.searchAirbnbAlternatives(issue, world, plan);
          
          if (airbnbAlternative) {
            logs.push({
              persona: 'NEPTUNE',
              action: 'REPLACE',
              explanation: `发现 ${issue.type}（${issue.reason}），通过 Airbnb 搜索找到路线内的替代住宿: ${airbnbAlternative.explanation}`,
              reasonCodes: ['AIRBNB_ALTERNATIVE_FOUND'],
              evidenceRefs: [issue.issueId, airbnbAlternative.newPoiId || ''],
              timestamp: new Date().toISOString(),
              decisionSource: 'HEURISTIC',
              decisionStage: 'SPATIAL_REPAIR',
            });
            
            // 应用 Airbnb 替代方案（简化处理：记录日志）
            continue;
          }
        }

        // 如果问题是交通相关（公共交通不可用），尝试使用 Booking.com 搜索租车
        if (issue.type === 'POI_UNAVAILABLE' && 
            issue.originalLocation && 
            (issue.reason?.includes('transport') || issue.reason?.includes('交通'))) {
          const carRentalAlternative = await this.searchCarRentalAlternatives(issue, world, plan);
          
          if (carRentalAlternative) {
            logs.push({
              persona: 'NEPTUNE',
              action: 'REPLACE',
              explanation: `发现 ${issue.type}（${issue.reason}），通过 Booking.com 搜索找到租车替代方案: ${carRentalAlternative.explanation}`,
              reasonCodes: ['BOOKING_COM_CAR_RENTAL_FOUND'],
              evidenceRefs: [issue.issueId, carRentalAlternative.newPoiId || ''],
              timestamp: new Date().toISOString(),
              decisionSource: 'HEURISTIC',
              decisionStage: 'SPATIAL_REPAIR',
            });
            
            // 应用租车替代方案（简化处理：记录日志）
            continue;
          }
        }
        
        // 找不到合理替代：不强行修复，记录日志
        logs.push({
          persona: 'NEPTUNE',
          action: 'ALLOW',
          explanation: `发现 ${issue.type}（${issue.reason}），但在保持路线哲学的前提下未找到合理替代，将保留原结构交由上层处理`,
          reasonCodes: ['NO_SUITABLE_REPLACEMENT'],
          evidenceRefs: [issue.issueId],
          timestamp: new Date().toISOString(),
          decisionSource: 'PHILOSOPHY',
          decisionStage: 'SPATIAL_REPAIR',
        });
        continue;
      }

      // 5️⃣ 替换前检查：验证不会违反路线哲学
      if (philosophy) {
        const validation = validateReplacementAgainstPhilosophy(
          {
            type: operation.type,
            originalPoiId: operation.originalPoiId,
            newPoiId: operation.newPoiId,
            originalSegmentId: operation.originalSegmentId,
            newSegmentIds: operation.newSegmentIds,
            // TODO: 从替换操作中提取 removedTags 和 addedTags
            removedTags: [],
            addedTags: [],
          },
          philosophy
        );

        if (!validation.allowed) {
          this.logger.warn(
            `替换操作违反路线哲学: ${validation.violations.join('; ')}`
          );
          logs.push({
            persona: 'NEPTUNE',
            action: 'ALLOW',
            explanation: `替换操作违反路线哲学（${validation.violations.join('; ')}），拒绝替换`,
            reasonCodes: ['PHILOSOPHY_VIOLATION'],
            evidenceRefs: [issue.issueId],
            timestamp: new Date().toISOString(),
            decisionSource: 'PHILOSOPHY',
            decisionStage: 'SPATIAL_REPAIR',
          });
          continue;
        }
      }

      // 6️⃣ 应用替换操作
      const planBefore = currentPlan;
      currentPlan = this.applyReplacement(currentPlan, operation);

      // 7️⃣ 替换后检查：核心标签/体验仍然覆盖
      if (philosophy) {
        // TODO: 从替换后的计划中提取当前标签
        const currentTags: string[] = routeDirection.tags || [];
        const coverage = checkCoreExperienceCoverage(currentTags, philosophy);

        if (!coverage.covered) {
          this.logger.warn(
            `替换后核心体验缺失: ${coverage.missingTags.join(', ')}`
          );
          // 回滚替换
          currentPlan = planBefore;
          logs.push({
            persona: 'NEPTUNE',
            action: 'ALLOW',
            explanation: `替换后核心体验缺失（${coverage.missingTags.join(', ')}），拒绝替换`,
            reasonCodes: ['CORE_EXPERIENCE_MISSING'],
            evidenceRefs: [issue.issueId],
            timestamp: new Date().toISOString(),
            decisionSource: 'PHILOSOPHY',
            decisionStage: 'SPATIAL_REPAIR',
          });
          continue;
        }
      }

      hasReplacement = true;

      logs.push({
        persona: 'NEPTUNE',
        action: 'REPLACE',
        explanation: operation.explanation,
        reasonCodes: [issue.type, 'SPATIAL_REPLACEMENT'],
        evidenceRefs: [issue.issueId],
        timestamp: new Date().toISOString(),
        decisionSource: 'PHYSICAL', // 空间替换基于物理现实
        decisionStage: 'SPATIAL_REPAIR',
      });
    }

    const action: DecisionAction = hasReplacement ? 'REPLACE' : 'ALLOW';
    this.logger.debug(`Neptune 评估完成: ${action}, 替换数: ${hasReplacement ? logs.filter(l => l.action === 'REPLACE').length : 0}`);

    return {
      allowed: true,
      action,
      updatedPlan: hasReplacement ? currentPlan : undefined,
      logs,
    };
  }

  /**
   * 检测空间问题（补充检测：天气和合规问题）
   * 
   * 注意：主要检测由 SpatialIssueDetectorService 完成
   * 这里补充检测天气和合规相关的问题
   */
  private async detectAdditionalSpatialIssues(
    world: WorldModelContext,
    plan: RoutePlanDraft
  ): Promise<SpatialIssue[]> {
    const issues: SpatialIssue[] = [];

    // 1. 检测天气硬违规导致的路段阻塞
    // 注意：天气证据现在应该从 PhysicalRealityModel.climateSeasonality 获取
    // 这里暂时跳过，因为 PhysicalRealityModel 中没有直接的 weatherEvidence
    // TODO: 从 PhysicalRealityModel.climateSeasonality 中提取天气信息
    if (world.physical.climateSeasonality) {
      const climate = world.physical.climateSeasonality;
      // 检查天气条件是否导致路段阻塞
      if (climate.typicalWeather && 
          (climate.typicalWeather.windSpeedMps > 15 || 
           climate.typicalWeather.visibilityMeters < 100)) {
        // 创建天气相关的空间问题
        // 注意：这里简化处理，实际应该找到对应的 segment
        for (const segment of plan.segments) {
          issues.push({
            issueId: `weather_${segment.segmentId}_${Date.now()}`,
            type: 'SEGMENT_BLOCKED',
            segmentId: segment.segmentId,
            severity: 'HARD',
            reason: `天气条件不符合安全要求（风速 ${climate.typicalWeather.windSpeedMps.toFixed(1)} m/s，能见度 ${climate.typicalWeather.visibilityMeters.toFixed(0)}m）`,
            originalLocation: segment.metadata?.location
              ? {
                  lat: segment.metadata.location.lat,
                  lng: segment.metadata.location.lng,
                }
              : undefined,
            metadata: {
              windSpeedMps: climate.typicalWeather.windSpeedMps,
              visibilityMeters: climate.typicalWeather.visibilityMeters,
              precipitationMmPerHour: climate.typicalWeather.precipitationMmPerHour,
            },
          });
          break; // 只添加一个，避免重复
        }
      }
    }

    // 2. 检测合规问题（如需要许可但未获得）
    if (world.complianceEvidence) {
      for (const compliance of world.complianceEvidence) {
        if (compliance.violation === 'HARD' && !compliance.valid) {
          if (compliance.requiresPermit && !compliance.valid) {
            issues.push({
              issueId: `compliance_permit_${Date.now()}`,
              type: 'SEGMENT_BLOCKED',
              severity: 'HARD',
              reason: '需要许可但未获得',
              metadata: {
                requiresPermit: compliance.requiresPermit,
                requiresGuide: compliance.requiresGuide,
              },
            });
          }
        }
      }
    }

    return issues;
  }

  /**
   * 提取路线哲学
   */
  private extractRoutePhilosophy(routeDirection: any): RoutePhilosophy | null {
    if (!routeDirection) {
      return null;
    }

    // 如果已经是 RoutePhilosophy 对象，直接返回
    if (routeDirection.philosophy && typeof routeDirection.philosophy === 'object') {
      return routeDirection.philosophy as RoutePhilosophy;
    }

    // 如果是字符串，尝试解析（简化处理，实际可能需要更复杂的解析）
    if (routeDirection.philosophy && typeof routeDirection.philosophy === 'string') {
      // 暂时返回 null，后续可以实现字符串到 RoutePhilosophy 的转换
      this.logger.debug(`路线哲学是字符串格式，暂不支持解析: ${routeDirection.philosophy}`);
      return null;
    }

    return null;
  }

  /**
   * 处理单个空间问题
   */
  private async handleIssue(
    issue: SpatialIssue,
    world: WorldModelContext,
    plan: RoutePlanDraft,
    routeDirection: any
  ): Promise<ReplacementOperation | null> {
    // 第一性原理：空间约束检查
    // 验证替代点/替代段是否在 corridorGeom 缓冲范围内或 regions 指定的区域内
    const spatialConstraintValid = this.validateSpatialConstraint(
      issue,
      world.physical,
      routeDirection
    );

    if (!spatialConstraintValid) {
      this.logger.warn(
        `空间问题 ${issue.issueId} 的替代方案不在路线走廊或区域内，拒绝替换`
      );
      return null;
    }

    const input = {
      world,
      plan,
      spatialIssues: [issue],
      routeDirection,
    };

    switch (issue.type) {
      case 'ENTRY_UNREACHABLE':
        return this.spatialReplacement.replaceEntry(issue, input);

      case 'POI_UNAVAILABLE': {
        const segment = plan.segments.find(s => s.segmentId === issue.segmentId);
        const dayIndex = segment?.dayIndex || 1;
        return this.spatialReplacement.replacePoi(issue, input, dayIndex);
      }

      case 'SEGMENT_BLOCKED':
      case 'HAZARD_ZONE':
        return this.spatialReplacement.replaceSegmentCorridor(issue, input);

      default:
        return null;
    }
  }

  /**
   * 使用 Exa 搜索替代方案
   */
  private async searchExaAlternatives(
    issue: SpatialIssue,
    world: WorldModelContext,
    routeDirection: any,
  ): Promise<ReplacementOperation | null> {
    if (!this.exaIntegration) {
      return null;
    }

    try {
      // 构建搜索查询
      const destination = issue.originalLocation 
        ? `${issue.originalLocation.lat},${issue.originalLocation.lng}`
        : world.physical.countryCode;
      const category = issue.type === 'POI_UNAVAILABLE' ? '景点' : '入口点';
      const month = world.physical.month;

      // 搜索替代方案
      const alternatives = await this.exaIntegration.searchAlternativeDestinations(
        destination,
        category,
        month,
        new Date().getFullYear(),
      );

      if (alternatives.alternatives.length === 0) {
        return null;
      }

      // 选择第一个替代方案（简化处理）
      const alternative = alternatives.alternatives[0];
      
      // 返回一个简化的替换操作（实际应用中需要更详细的处理）
      return {
        type: issue.type === 'POI_UNAVAILABLE' ? 'POI_REPLACEMENT' : 'ENTRY_REPLACEMENT',
        originalPoiId: issue.poiId || '',
        newPoiId: `exa_${Date.now()}`, // 临时 ID，实际需要从搜索结果中提取
        score: 0.5, // 默认评分
        explanation: `通过实时信息搜索找到替代方案: ${alternative.name}${alternative.description ? ` - ${alternative.description}` : ''}`,
      };
    } catch (error: any) {
      this.logger.warn(`Exa alternative search failed: ${error.message}`);
      return null;
    }
  }

  /**
   * 使用 Booking.com 搜索租车替代方案
   */
  private async searchCarRentalAlternatives(
    issue: SpatialIssue,
    world: WorldModelContext,
    plan: RoutePlanDraft,
  ): Promise<ReplacementOperation | null> {
    if (!this.bookingComIntegration || !issue.originalLocation) {
      return null;
    }

    try {
      // 估算日期和时间
      const currentYear = new Date().getFullYear();
      const month = world.physical.month;
      const dayDate = new Date(currentYear, month - 1, 1);
      const pickupTime = '10:00';
      const dropoffTime = '18:00';
      const driverAge = (world.human as any)?.driverAge || 25;

      // 搜索路线走廊内的租车（5km 半径）
      const availability = await this.bookingComIntegration.searchCarRentalsInCorridor(
        issue.originalLocation,
        5, // 5km 半径
        pickupTime,
        dropoffTime,
        driverAge,
      );

      if (!availability.available || !availability.rentals || availability.rentals.length === 0) {
        return null;
      }

      // 选择价格最低的租车
      const cheapest = availability.rentals.reduce((prev, curr) => {
        const prevPrice = prev.price?.amount || Infinity;
        const currPrice = curr.price?.amount || Infinity;
        return currPrice < prevPrice ? curr : prev;
      });

      return {
        type: 'POI_REPLACEMENT',
        originalPoiId: issue.poiId || '',
        newPoiId: cheapest.id,
        score: 0.7, // 租车替代方案评分略高于住宿（因为更灵活）
        explanation: `找到路线内的租车替代方案: ${cheapest.company} - ${cheapest.vehicleType}（价格 ${cheapest.price?.currency} ${cheapest.price?.amount}）`,
      };
    } catch (error: any) {
      this.logger.warn(`Booking.com car rental search failed: ${error.message}`);
      return null;
    }
  }

  /**
   * 使用 Airbnb 搜索替代住宿
   */
  private async searchAirbnbAlternatives(
    issue: SpatialIssue,
    world: WorldModelContext,
    plan: RoutePlanDraft,
  ): Promise<ReplacementOperation | null> {
    if (!this.airbnbIntegration || !issue.originalLocation) {
      return null;
    }

    try {
      // 估算日期（简化处理）
      const currentYear = new Date().getFullYear();
      const month = world.physical.month;
      const dayDate = new Date(currentYear, month - 1, 1);
      const checkinDate = dayDate.toISOString().split('T')[0];
      const checkoutDate = new Date(dayDate.getTime() + 86400000).toISOString().split('T')[0];
      const partySize = (world.human as any)?.partySize || 2;

      // 搜索路线走廊内的住宿（5km 半径）
      const availability = await this.airbnbIntegration.searchAccommodationsInCorridor(
        issue.originalLocation,
        5, // 5km 半径
        checkinDate,
        checkoutDate,
        partySize,
      );

      if (!availability.available || !availability.listings || availability.listings.length === 0) {
        return null;
      }

      // 选择最近的住宿
      const nearest = availability.listings.reduce((prev, curr) => {
        const prevDist = prev.distanceFromPoint || Infinity;
        const currDist = curr.distanceFromPoint || Infinity;
        return currDist < prevDist ? curr : prev;
      });

      return {
        type: 'POI_REPLACEMENT',
        originalPoiId: issue.poiId || '',
        newPoiId: nearest.id,
        score: 0.6, // 默认评分
        explanation: `找到路线内的替代住宿: ${nearest.name}（距离 ${(nearest.distanceFromPoint || 0 / 1000).toFixed(1)}km）`,
      };
    } catch (error: any) {
      this.logger.warn(`Airbnb alternative search failed: ${error.message}`);
      return null;
    }
  }

  /**
   * 应用替换操作到计划
   */
  private applyReplacement(
    plan: RoutePlanDraft,
    operation: ReplacementOperation
  ): RoutePlanDraft {
    const updated = { ...plan, segments: [...plan.segments] };

    switch (operation.type) {
      case 'ENTRY_REPLACEMENT':
      case 'POI_REPLACEMENT': {
        // 替换 POI ID
        if (operation.originalPoiId && operation.newPoiId) {
          for (const segment of updated.segments) {
            if (segment.metadata?.poiId === operation.originalPoiId) {
              segment.metadata = {
                ...segment.metadata,
                poiId: operation.newPoiId,
                replaced: true,
                replacementReason: operation.explanation,
              };
            }
          }
        }
        break;
      }

      case 'SEGMENT_REPLACEMENT': {
        // 替换路段
        if (operation.originalSegmentId && operation.newSegmentIds) {
          const segmentIndex = updated.segments.findIndex(
            s => s.segmentId === operation.originalSegmentId
          );

          if (segmentIndex >= 0) {
            // 移除原路段，插入新路段
            updated.segments.splice(segmentIndex, 1);
            // TODO: 插入新路段（需要从 operation 中获取新路段数据）
          }
        }
        break;
      }
    }

    return updated;
  }

  /**
   * 验证空间约束
   * 
   * 第一性原理：所有替代点/替代段必须：
   * - 在 routeDirection.corridorGeom 缓冲范围内
   * - 或在其 regions 指定的区域内
   */
  private validateSpatialConstraint(
    issue: SpatialIssue,
    physical: import('../models/physical-reality.model').PhysicalRealityModel,
    routeDirection: any
  ): boolean {
    // 简化处理：如果有 originalLocation，检查是否在 regions 内
    if (issue.originalLocation && routeDirection.regions) {
      // TODO: 实现更精确的地理空间检查（使用 PostGIS）
      // 这里暂时返回 true，表示通过基本检查
      return true;
    }

    // 如果没有 originalLocation，假设可以通过（由 SpatialReplacementService 处理）
    return true;
  }

  /**
   * 获取 RouteDirection 信息
   */
  private async getRouteDirection(routeDirectionId: string): Promise<any> {
    if (!this.routeDirectionsService) {
      this.logger.warn('RouteDirectionsService 未注入，返回默认值');
      return {
        id: routeDirectionId,
        corridorGeom: undefined,
        regions: [],
        philosophy: '',
        metadata: {},
      };
    }

    try {
      // 尝试通过 ID 或 UUID 获取
      const id = parseInt(routeDirectionId, 10);
      if (!isNaN(id)) {
        const rd = await this.routeDirectionsService.findRouteDirectionById(id);
        if (rd) {
          return {
            id: rd.id,
            uuid: rd.uuid,
            corridorGeom: (rd as any).corridorGeom,
            regions: rd.regions || [],
            philosophy: (rd.metadata as any)?.philosophy || '',
            metadata: rd.metadata || {},
          };
        }
      }

      // 如果 ID 解析失败，尝试通过 UUID 查找
      // TODO: 实现通过 UUID 查找的方法
      this.logger.warn(`无法解析 RouteDirection ID: ${routeDirectionId}`);
      return {
        id: routeDirectionId,
        corridorGeom: undefined,
        regions: [],
        philosophy: '',
        metadata: {},
      };
    } catch (error) {
      this.logger.error(`获取 RouteDirection 失败: ${error}`);
      return {
        id: routeDirectionId,
        corridorGeom: undefined,
        regions: [],
        philosophy: '',
        metadata: {},
      };
    }
  }
}

