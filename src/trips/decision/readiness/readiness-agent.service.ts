// src/trips/decision/readiness/readiness-agent.service.ts
/**
 * Readiness Agent Service
 * 
 * 从 WorldModelContext 和 TripPlan 反推出旅行准备度清单
 * 
 * 设计原则：
 * - 基于第一性原理：PhysicalRealityModel + HumanCapabilityModel + RouteDirection
 * - 实况出行天气：`signals.executionSemanticView`（与 Checker / Neptune 同源），不解析 physical.weatherEvidence
 * - 自动生成检查项，不依赖 LLM（确定性）
 * - 提供可解释的原因信号链
 */

import { Injectable, Logger } from '@nestjs/common';
import { WorldModelContext } from '../shared/world-model.types';
import { TripPlan } from '../plan-model';
import {
  TravelReadinessResult,
  TravelReadinessChecklistItem,
  ReadinessSeverity,
} from './types/readiness-checklist.types';
import { PhysicalRealityModel } from '../models/physical-reality.model';
import { HumanCapabilityModel } from '../models/human-capability.model';
import type { UnifiedExecutionSemanticView } from '../execution/unified-execution-semantic-view';

@Injectable()
export class ReadinessAgentService {
  private readonly logger = new Logger(ReadinessAgentService.name);

  /**
   * 从 WorldModelContext 和 TripPlan 生成准备度清单
   */
  run(world: WorldModelContext, plan: TripPlan): TravelReadinessResult {
    const items: TravelReadinessChecklistItem[] = [];

    // 1. 从 PhysicalRealityModel 生成检查项
    items.push(...this.deriveFromPhysicalReality(world.physical, world.human));

    // 1b. Layer A：实况执行语义（与 Checker / Neptune 同源，不读 physical.weatherEvidence）
    items.push(
      ...this.deriveFromExecutionSemanticView(world.executionSemanticView, plan),
    );

    // 2. 从 HumanCapabilityModel 生成检查项
    items.push(...this.deriveFromHumanCapability(world.human));

    // 3. 从 RouteDirection 生成检查项
    items.push(...this.deriveFromRouteDirection(world.routeDirection));

    // 4. 从 TripPlan 生成检查项（基于实际行程）
    items.push(...this.deriveFromTripPlan(plan, world));

    // 分组结果
    const itemsByType = {
      GEAR: items.filter(i => i.type === 'GEAR'),
      DOCUMENT: items.filter(i => i.type === 'DOCUMENT'),
      HEALTH: items.filter(i => i.type === 'HEALTH'),
      SKILL: items.filter(i => i.type === 'SKILL'),
    };

    const itemsBySeverity = {
      MUST: items.filter(i => i.severity === 'MUST'),
      SHOULD: items.filter(i => i.severity === 'SHOULD'),
      OPTIONAL: items.filter(i => i.severity === 'OPTIONAL'),
    };

    // 生成摘要
    const summary = this.generateSummary(itemsBySeverity, world);

    // 获取 routeId（可能来自 metadata 或扩展字段）
    const routeId = (world.routeDirection as any).id?.toString() || 
                    (world.routeDirection as any).uuid || 
                    undefined;

    return {
      routeId,
      summary,
      items,
      itemsByType,
      itemsBySeverity,
    };
  }

  /**
   * 从 PhysicalRealityModel 推导检查项
   */
  private deriveFromPhysicalReality(
    physical: PhysicalRealityModel,
    human: HumanCapabilityModel
  ): TravelReadinessChecklistItem[] {
    const items: TravelReadinessChecklistItem[] = [];

    // 检查道路状态
    for (const roadState of physical.roadStates) {
      if (roadState.requires4x4) {
        items.push({
          id: `gear-4x4-${roadState.roadId}`,
          type: 'GEAR',
          severity: 'MUST',
          title: '4x4 车辆',
          description: `路线包含需要 4x4 的路段：${roadState.roadId}`,
          reasonSignals: ['F-road', 'requires4x4', roadState.roadId],
        });
      }

      if (roadState.requiresPermit) {
        items.push({
          id: `doc-permit-${roadState.roadId}`,
          type: 'DOCUMENT',
          severity: 'MUST',
          title: '道路许可证',
          description: `路段 ${roadState.roadId} 需要许可证`,
          reasonSignals: ['road_requires_permit', roadState.roadId],
        });
      }
    }

    // 检查危险区域
    for (const hazard of physical.hazardZones) {
      if (hazard.level === 'HIGH' || hazard.level === 'MEDIUM') {
        const severity: ReadinessSeverity = hazard.level === 'HIGH' ? 'MUST' : 'SHOULD';
        let title = '';
        let description = '';

        switch (hazard.type) {
          case 'AVALANCHE':
            title = '雪崩安全装备';
            description = '路线经过雪崩风险区域，需要携带雪崩安全装备（信标、铲子、探针）';
            break;
          case 'MUDSLIDE':
            title = '泥石流风险意识';
            description = '路线经过泥石流风险区域，需要关注天气预警';
            break;
          case 'FLOOD':
            title = '涉水准备';
            description = '路线可能涉及涉水路段，需要准备防水装备';
            break;
          case 'ICE':
            title = '冰爪/防滑装备';
            description = '路线涉及冰雪路段，需要冰爪或防滑装备';
            break;
          default:
            title = '风险区域安全装备';
            description = `路线经过 ${hazard.type} 风险区域`;
        }

        items.push({
          id: `gear-hazard-${hazard.zoneId}`,
          type: 'GEAR',
          severity,
          title,
          description,
          reasonSignals: [`hazard_${hazard.type}`, `level_${hazard.level}`, hazard.zoneId],
        });
      }
    }

    // 检查气候季节性
    if (physical.climateSeasonality) {
      const climate = physical.climateSeasonality;
      
      if (climate.riskFactors?.includes('snow')) {
        items.push({
          id: 'gear-winter-clothing',
          type: 'GEAR',
          severity: 'MUST',
          title: '冬季保暖装备',
          description: '目的地在该月份有降雪，需要保暖衣物和防滑装备',
          reasonSignals: ['climate_snow', `month_${physical.month}`],
        });
      }

      if (climate.riskFactors?.includes('high_wind')) {
        items.push({
          id: 'gear-wind-protection',
          type: 'GEAR',
          severity: 'SHOULD',
          title: '防风装备',
          description: '目的地在该月份风力较大，建议携带防风装备',
          reasonSignals: ['climate_high_wind', `month_${physical.month}`],
        });
      }

      if (climate.typicalWeather?.temperatureCelsius && climate.typicalWeather.temperatureCelsius < 0) {
        items.push({
          id: 'gear-cold-weather',
          type: 'GEAR',
          severity: 'MUST',
          title: '防寒装备',
          description: `目的地该月份平均气温 ${climate.typicalWeather.temperatureCelsius}°C，需要防寒装备`,
          reasonSignals: ['climate_cold', `temp_${climate.typicalWeather.temperatureCelsius}`],
        });
      }
    }

    // 检查 DEM 证据（高海拔）
    for (const demEvidence of physical.demEvidence) {
      if (demEvidence.metadata?.elevationRange) {
        const maxElev = demEvidence.metadata.elevationRange.max;
        if (maxElev > 3000) {
          const severity = maxElev > 4500 ? 'MUST' : 'SHOULD';
          items.push({
            id: `health-altitude-${demEvidence.segmentId}`,
            type: 'HEALTH',
            severity,
            title: '高海拔适应准备',
            description: `路线最高海拔 ${Math.round(maxElev)} 米，需要高海拔适应准备`,
            reasonSignals: ['high_altitude', `elevation_${Math.round(maxElev)}`, demEvidence.segmentId],
          });

          // 如果用户没有高海拔经验，建议更严格的检查
          if (human.highAltitudeExperience === 'NONE' && maxElev > 3500) {
            items.push({
              id: 'health-altitude-checkup',
              type: 'HEALTH',
              severity: 'SHOULD',
              title: '高海拔体检',
              description: '建议出发前进行高海拔适应性体检',
              reasonSignals: ['no_altitude_experience', `elevation_${Math.round(maxElev)}`],
            });
          }
        }
      }
    }

    return items;
  }

  /**
   * 与 `signals.executionSemanticView` 对齐的出行准备项（唯一实况解释层）
   */
  private deriveFromExecutionSemanticView(
    view: UnifiedExecutionSemanticView | undefined,
    plan: TripPlan,
  ): TravelReadinessChecklistItem[] {
    const items: TravelReadinessChecklistItem[] = [];
    if (!view?.byDate) {
      return items;
    }

    for (const day of plan.days) {
      const row = view.byDate[day.date];
      if (!row) {
        continue;
      }

      const hard =
        row.neptuneWeatherTier === 'HARD' ||
        row.weather.violation === 'HARD' ||
        row.weather.executionState === 'BLOCKED';

      if (hard) {
        items.push({
          id: `exec-semantic-weather-hard-${day.date}`,
          type: 'HEALTH',
          severity: 'MUST',
          title: '实况天气安全风险（阻断级）',
          description:
            row.weather.explanation ??
            '当日实况不满足安全阈值；请调整行程或装备后再出行。',
          reasonSignals: [
            'layer_a_execution_semantic',
            'weather_hard',
            day.date,
            row.weather.executionState ?? 'unknown',
          ],
          metadata: {
            source: 'UnifiedExecutionSemanticView',
            evidence_date: day.date,
          },
        });
        continue;
      }

      if (
        row.neptuneWeatherTier === 'SOFT' ||
        row.outdoorWeatherStress.adverse
      ) {
        items.push({
          id: `exec-semantic-weather-soft-${day.date}`,
          type: 'GEAR',
          severity: 'SHOULD',
          title: '天气条件降级（预留时间与防护）',
          description:
            row.weather.explanation ??
            '当日天气执行语义提示降级：预留缓冲并检查防风/防滑装备。',
          reasonSignals: [
            'layer_a_execution_semantic',
            'weather_soft',
            day.date,
            ...row.outdoorWeatherStress.reasons,
          ],
          metadata: {
            source: 'UnifiedExecutionSemanticView',
            evidence_date: day.date,
          },
        });
      }
    }

    return items;
  }

  /**
   * 从 HumanCapabilityModel 推导检查项
   */
  private deriveFromHumanCapability(human: HumanCapabilityModel): TravelReadinessChecklistItem[] {
    const items: TravelReadinessChecklistItem[] = [];

    // 检查膝盖情况（从 metadata 推断，如果有）
    if (human.metadata?.kneeIssues || human.metadata?.kneeProblems) {
      items.push({
        id: 'gear-knee-support',
        type: 'GEAR',
        severity: 'SHOULD',
        title: '护膝/支撑装备',
        description: '建议携带护膝或膝关节支撑装备，减轻徒步时的膝盖负担',
        reasonSignals: ['knee_issues'],
      });
    }

    // 检查是否需要渐进适应（高海拔）
    if (human.requiresGradualAscent) {
      items.push({
        id: 'health-gradual-ascent',
        type: 'HEALTH',
        severity: 'SHOULD',
        title: '渐进式海拔适应计划',
        description: '需要制定渐进式海拔适应计划，避免高反',
        reasonSignals: ['requires_gradual_ascent', `max_elevation_${human.maxElevationM || 'unknown'}`],
      });
    }

    // 检查体能水平（基于爬升能力）
    if (human.maxDailyAscentM < 500) {
      items.push({
        id: 'health-fitness-training',
        type: 'HEALTH',
        severity: 'OPTIONAL',
        title: '体能训练建议',
        description: '建议出发前进行体能训练，提高单日爬升能力',
        reasonSignals: ['low_daily_ascent', `max_${human.maxDailyAscentM}m`],
      });
    }

    // 检查风险承受度
    if (human.riskTolerance === 'LOW') {
      items.push({
        id: 'skill-risk-awareness',
        type: 'SKILL',
        severity: 'OPTIONAL',
        title: '风险评估技能',
        description: '建议提前学习基本的安全评估技能',
        reasonSignals: ['low_risk_tolerance'],
      });
    }

    return items;
  }

  /**
   * 从 RouteDirection 推导检查项
   */
  private deriveFromRouteDirection(routeDirection: WorldModelContext['routeDirection']): TravelReadinessChecklistItem[] {
    const items: TravelReadinessChecklistItem[] = [];

    // 从 tags 推导
    const tags = routeDirection.tags || [];
    
    if (tags.some(t => t.includes('glacier') || t.includes('冰川'))) {
      items.push({
        id: 'gear-glacier-equipment',
        type: 'GEAR',
        severity: 'MUST',
        title: '冰川徒步装备',
        description: '路线涉及冰川徒步，需要专业装备（冰爪、冰镐等）',
        reasonSignals: ['glacier_hiking', ...tags.filter(t => t.includes('glacier') || t.includes('冰川'))],
      });
    }

    if (tags.some(t => t.includes('F-road') || t.includes('F路'))) {
      items.push({
        id: 'gear-froad-vehicle',
        type: 'GEAR',
        severity: 'MUST',
        title: '4x4 越野车辆',
        description: '路线包含 F-road，必须使用 4x4 车辆',
        reasonSignals: ['F-road', ...tags.filter(t => t.includes('F-road') || t.includes('F路'))],
      });
    }

    if (tags.some(t => t.includes('river') || t.includes('河流') || t.includes('涉水'))) {
      items.push({
        id: 'gear-river-crossing',
        type: 'GEAR',
        severity: 'SHOULD',
        title: '涉水装备',
        description: '路线可能涉及河流涉水，建议准备涉水装备',
        reasonSignals: ['river_crossing', ...tags.filter(t => t.includes('river') || t.includes('河流') || t.includes('涉水'))],
      });
    }

    if (tags.some(t => t.includes('ocean') || t.includes('出海') || t.includes('boat'))) {
      items.push({
        id: 'health-seasickness',
        type: 'HEALTH',
        severity: 'OPTIONAL',
        title: '晕船药',
        description: '路线包含出海活动，建议准备晕船药',
        reasonSignals: ['ocean_activity', ...tags.filter(t => t.includes('ocean') || t.includes('出海') || t.includes('boat'))],
      });
    }

    if (tags.some(t => t.includes('trek') || t.includes('多日') || t.includes('backpack'))) {
      items.push({
        id: 'gear-backpacking',
        type: 'GEAR',
        severity: 'MUST',
        title: '多日徒步装备',
        description: '路线涉及多日徒步，需要完整的背包装备',
        reasonSignals: ['multi_day_trek', ...tags.filter(t => t.includes('trek') || t.includes('多日') || t.includes('backpack'))],
      });
    }

    // 从 complianceRules 推导（如果有）
    if (routeDirection.complianceRules) {
      const compliance = routeDirection.complianceRules;
      
      if (compliance.requiresPermit) {
        items.push({
          id: 'doc-route-permit',
          type: 'DOCUMENT',
          severity: 'MUST',
          title: '路线许可证',
          description: '该路线需要特殊许可证',
          reasonSignals: ['route_requires_permit'],
        });
      }

      if (compliance.requiresGuide) {
        items.push({
          id: 'skill-guide-service',
          type: 'SKILL',
          severity: 'MUST',
          title: '向导服务',
          description: '该路线必须配备向导',
          reasonSignals: ['requires_guide'],
        });
      }
    }

    return items;
  }

  /**
   * 从 TripPlan 推导检查项（基于实际行程）
   */
  private deriveFromTripPlan(
    plan: TripPlan,
    _world: WorldModelContext
  ): TravelReadinessChecklistItem[] {
    const items: TravelReadinessChecklistItem[] = [];

    // 检查行程天数
    if (plan.days.length > 7) {
      items.push({
        id: 'gear-extended-trip',
        type: 'GEAR',
        severity: 'SHOULD',
        title: '长期旅行装备',
        description: `行程 ${plan.days.length} 天，建议准备充足的换洗衣物和日用品`,
        reasonSignals: [`duration_${plan.days.length}days`],
      });
    }

    // 检查行程中的最高海拔（从 terrainFacts）
    let maxElevationInPlan = 0;
    for (const day of plan.days) {
      if (day.terrainFacts?.maxElevation) {
        maxElevationInPlan = Math.max(maxElevationInPlan, day.terrainFacts.maxElevation);
      }
    }

    if (maxElevationInPlan > 0 && maxElevationInPlan > 3000) {
      // 已在 PhysicalRealityModel 中处理，这里可以添加行程特定的建议
      items.push({
        id: 'health-elevation-monitoring',
        type: 'HEALTH',
        severity: 'SHOULD',
        title: '海拔监测设备',
        description: `行程最高海拔 ${Math.round(maxElevationInPlan)} 米，建议携带海拔表或智能手表监测`,
        reasonSignals: [`plan_max_elevation_${Math.round(maxElevationInPlan)}`],
      });
    }

    return items;
  }

  /**
   * 生成摘要
   */
  private generateSummary(
    itemsBySeverity: {
      MUST: TravelReadinessChecklistItem[];
      SHOULD: TravelReadinessChecklistItem[];
      OPTIONAL: TravelReadinessChecklistItem[];
    },
    _world: WorldModelContext
  ): string {
    const mustCount = itemsBySeverity.MUST.length;
    const shouldCount = itemsBySeverity.SHOULD.length;
    const optionalCount = itemsBySeverity.OPTIONAL.length;

    const parts: string[] = [];

    if (mustCount > 0) {
      parts.push(`${mustCount} 项必须准备`);
    }
    if (shouldCount > 0) {
      parts.push(`${shouldCount} 项建议准备`);
    }
    if (optionalCount > 0) {
      parts.push(`${optionalCount} 项可选准备`);
    }

    return `本次行程共需要准备 ${mustCount + shouldCount + optionalCount} 项内容：${parts.join('，')}。`;
  }
}

