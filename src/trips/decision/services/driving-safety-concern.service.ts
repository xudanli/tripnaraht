/**
 * Driving Safety Concern Service
 *
 * 驾驶安全关注点检测（与 GuardianDebateService.identifyDayLevelConcerns 逻辑对齐）
 * 供 DrDreStrategy 使用，将「驾驶进入危险区」等提示写入三人格决策日志
 *
 * 参考: guardian-persona.interface.ts (DRIVING_SAFETY_CONFIG, ROAD_FATIGUE_FACTOR_MAP)
 *       guardian-debate.service.ts (identifyDayLevelConcerns)
 */

import { Injectable } from '@nestjs/common';
import {
  WorldModelContext,
  RoutePlanDraft,
} from '../shared/world-model.types';
import {
  DRIVING_SAFETY_CONFIG,
  DRIVING_ESTIMATION_CONFIG,
  ROAD_FATIGUE_FACTOR_MAP,
} from '../optimization/learning/guardian-persona.interface';

export interface DrivingConcern {
  dayIndex: number;
  dayLabel: string;
  message: string;
  severity: 'WARNING' | 'DANGER' | 'CRITICAL';
}

@Injectable()
export class DrivingSafetyConcernService {
  /**
   * 检测按天驾驶安全关注点（用户可读，如「Day2 驾驶进入危险区…」）
   */
  detectConcerns(plan: RoutePlanDraft, world: WorldModelContext): DrivingConcern[] {
    const out: DrivingConcern[] = [];
    const segments = Array.isArray(plan?.segments) ? plan.segments : [];
    if (segments.length === 0) return out;

    const speedKmH = this.getDrivingSpeedKmH(world);
    const effectiveSafeHours = this.getEffectiveSafeHours(world);
    const tripnaraWarningHours = effectiveSafeHours * DRIVING_SAFETY_CONFIG.warningRatio;
    const dangerZoneHours = effectiveSafeHours * DRIVING_SAFETY_CONFIG.dangerRatio;
    const physicalLimitHours = DRIVING_SAFETY_CONFIG.physicalLimitHours;

    const byDay = new Map<number, { distanceKm: number; ascentM: number }>();
    for (const s of segments) {
      const day = Number(s?.dayIndex) ?? 1;
      const cur = byDay.get(day) ?? { distanceKm: 0, ascentM: 0 };
      cur.distanceKm += Number(s?.distanceKm) || 0;
      cur.ascentM += Number(s?.ascentM) || 0;
      byDay.set(day, cur);
    }

    const dayOrder = Array.from(byDay.keys()).sort((a, b) => a - b);
    for (const dayIndex of dayOrder) {
      const { distanceKm, ascentM } = byDay.get(dayIndex)!;
      const dayLabel = dayIndex >= 1 ? `Day${dayIndex}` : `第${dayIndex}天`;
      const rawDrivingH = distanceKm / speedKmH;
      const drivingH = Math.min(rawDrivingH, physicalLimitHours);

      if (rawDrivingH > physicalLimitHours) {
        out.push({
          dayIndex,
          dayLabel,
          message: `${dayLabel} 路程约${Math.round(distanceKm)}km，单日内无法完成，建议拆分日程`,
          severity: 'CRITICAL',
        });
      } else if (drivingH >= dangerZoneHours) {
        out.push({
          dayIndex,
          dayLabel,
          message: `${dayLabel} 驾驶进入危险区（约 ${drivingH.toFixed(1)}h，≥${dangerZoneHours.toFixed(1)}h 事故率明显上升），强烈建议拆分`,
          severity: 'DANGER',
        });
      } else if (drivingH >= effectiveSafeHours) {
        out.push({
          dayIndex,
          dayLabel,
          message: `${dayLabel} 超过安全驾驶上限（约 ${drivingH.toFixed(1)}h，推荐 ≤${effectiveSafeHours.toFixed(1)}h），疲劳风险显著`,
          severity: 'WARNING',
        });
      } else if (drivingH >= tripnaraWarningHours) {
        out.push({
          dayIndex,
          dayLabel,
          message: `${dayLabel} 今日行程偏紧（约 ${drivingH.toFixed(1)}h），建议拆分或预留休息`,
          severity: 'WARNING',
        });
      }
      if (ascentM >= 600) {
        const a = ascentM >= 1000 ? `${Math.round(ascentM / 100) / 10}km` : `约 ${Math.round(ascentM)}m`;
        out.push({
          dayIndex,
          dayLabel,
          message: `${dayLabel} 爬升较多（${a}），注意体能分配`,
          severity: 'WARNING',
        });
      }
    }

    return out.slice(0, 5);
  }

  private getEffectiveSafeHours(world: WorldModelContext): number {
    const base = DRIVING_SAFETY_CONFIG.baseSafeHours;
    const human = world?.human as {
      age?: number;
      ageGroup?: string;
      metadata?: { drivingFatigueFactors?: { sleepFactor?: number; breakFactor?: number; stressFactor?: number } };
    } | undefined;

    const sleepFactor = human?.metadata?.drivingFatigueFactors?.sleepFactor ?? 1.0;
    const breakFactor = human?.metadata?.drivingFatigueFactors?.breakFactor ?? 1.0;
    const stressFactor = human?.metadata?.drivingFatigueFactors?.stressFactor ?? 1.0;

    const age = human?.age ?? (human?.ageGroup === '60+' ? 65 : human?.ageGroup === '50-59' ? 55 : human?.ageGroup === '40-49' ? 45 : 35);
    const ageFactor = age <= 40 ? 1.0 : age <= 55 ? 0.9 : 0.75;

    const meta = (world?.routeDirection as { metadata?: Record<string, unknown> })?.metadata;
    const roadType =
      (meta?.route_basic_info as { road_type?: string })?.road_type ??
      (meta as { roadType?: string })?.roadType ??
      '';
    const lower = String(roadType).toLowerCase();
    let roadFactor = 1.0;
    for (const [keyword, factor] of Object.entries(ROAD_FATIGUE_FACTOR_MAP)) {
      if (lower.includes(keyword)) {
        roadFactor = factor;
        break;
      }
    }

    return base * sleepFactor * roadFactor * breakFactor * stressFactor * ageFactor;
  }

  private getDrivingSpeedKmH(world: WorldModelContext): number {
    const meta = (world?.routeDirection as { metadata?: Record<string, unknown> })?.metadata;
    if (!meta) return DRIVING_ESTIMATION_CONFIG.defaultSpeedKmH;

    const roadType =
      (meta.route_basic_info as { road_type?: string })?.road_type ??
      (meta as { roadType?: string }).roadType ??
      '';
    const lower = String(roadType).toLowerCase();

    for (const [keyword, speed] of Object.entries(DRIVING_ESTIMATION_CONFIG.roadTypeSpeedMap)) {
      if (lower.includes(keyword)) return speed;
    }
    return DRIVING_ESTIMATION_CONFIG.defaultSpeedKmH;
  }
}
