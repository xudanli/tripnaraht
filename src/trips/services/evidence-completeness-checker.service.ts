// src/trips/services/evidence-completeness-checker.service.ts
import { Injectable } from '@nestjs/common';
import { EvidenceType } from '../dto/evidence.dto';
import { Place } from '@prisma/client';
import {
  buildCoveragePhaseMeta,
  getTripReadinessPhase,
} from '../readiness/utils/trip-readiness-relevance.util';

/**
 * 证据完整性检查结果
 */
export interface EvidenceCompletenessResult {
  completenessScore: number;
  missingEvidence: Array<{
    poiId: number;
    poiName: string;
    missingTypes: EvidenceType[];
    impact: 'LOW' | 'MEDIUM' | 'HIGH';
    reason: string;
  }>;
  recommendations: Array<{
    action: string;
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
    estimatedTime: number;
    evidenceTypes: EvidenceType[];
    affectedPois: number[];
  }>;
  readinessPhase?: 'planning' | 'pre_departure' | 'in_trip' | 'past';
  daysUntilStart?: number;
  phaseHint?: string;
  deferredEvidenceCount?: number;
}

@Injectable()
export class EvidenceCompletenessChecker {
  checkCompleteness(
    places: Place[],
    existingEvidence: Array<{ poiId?: string; type: EvidenceType }>,
    tripStartDate?: string,
  ): EvidenceCompletenessResult {
    const missingEvidence: EvidenceCompletenessResult['missingEvidence'] = [];
    const evidenceMap = this.buildEvidenceMap(existingEvidence);
    const tripStart = tripStartDate ? new Date(tripStartDate) : undefined;
    const isWinter = this.isWinterSeason(tripStartDate);
    const isPlanning = tripStart ? getTripReadinessPhase(tripStart) === 'planning' : false;
    const phaseMeta = tripStart ? buildCoveragePhaseMeta(tripStart) : undefined;

    let totalExpected = 0;
    let totalMissing = 0;
    let deferredEvidenceCount = 0;

    for (const place of places) {
      const existingTypes = new Set<EvidenceType>([
        ...(evidenceMap.get(place.id) || []),
        ...this.getMetadataEvidenceTypes(place),
      ]);

      const { required, deferred } = this.getRequiredEvidenceTypes(place, isWinter, isPlanning);
      deferredEvidenceCount += deferred.length;
      totalExpected += required.length;

      const missingTypes = required.filter((type) => !existingTypes.has(type));

      if (missingTypes.length > 0) {
        totalMissing += missingTypes.length;
        missingEvidence.push({
          poiId: place.id,
          poiName: place.nameCN || place.nameEN || `Place ${place.id}`,
          missingTypes,
          impact: this.calculateImpact(missingTypes, place),
          reason: this.getMissingReason(missingTypes, place, isPlanning),
        });
      }
    }

    const completenessScore = totalExpected > 0 ? 1 - totalMissing / totalExpected : 1.0;
    const recommendations = this.generateRecommendations(missingEvidence, places);

    return {
      completenessScore,
      missingEvidence,
      recommendations,
      readinessPhase: phaseMeta?.readinessPhase,
      daysUntilStart: phaseMeta?.daysUntilStart,
      phaseHint: phaseMeta?.phaseHint.zh || undefined,
      deferredEvidenceCount: deferredEvidenceCount > 0 ? deferredEvidenceCount : undefined,
    };
  }

  private buildEvidenceMap(
    existingEvidence: Array<{ poiId?: string; type: EvidenceType }>,
  ): Map<number, Set<EvidenceType>> {
    const map = new Map<number, Set<EvidenceType>>();

    for (const evidence of existingEvidence) {
      if (evidence.poiId) {
        const poiId = parseInt(evidence.poiId, 10);
        if (!Number.isNaN(poiId)) {
          if (!map.has(poiId)) {
            map.set(poiId, new Set());
          }
          map.get(poiId)!.add(evidence.type);
        }
      }
    }

    return map;
  }

  private getMetadataEvidenceTypes(place: Place): EvidenceType[] {
    const types: EvidenceType[] = [];
    const metadata = (place.metadata as Record<string, unknown>) || {};

    if (metadata.openingHours || metadata.opening_hours || (metadata.visit_info as any)?.fees) {
      types.push(EvidenceType.OPENING_HOURS);
    }
    if (metadata.weatherInfo || metadata.weather || metadata.weatherFetchedAt) {
      types.push(EvidenceType.WEATHER);
    }
    if (metadata.roadStatus || metadata.roadStatusFetchedAt) {
      types.push(EvidenceType.ROAD_CLOSURE);
    }
    if (metadata.bookingConfirmation || metadata.reservation) {
      types.push(EvidenceType.BOOKING);
    }

    return types;
  }

  private getRequiredEvidenceTypes(
    place: Place,
    isWinter: boolean,
    isPlanning: boolean,
  ): { required: EvidenceType[]; deferred: EvidenceType[] } {
    const required: EvidenceType[] = [];
    const deferred: EvidenceType[] = [];
    const metadata = (place.metadata as Record<string, unknown>) || {};
    const category = place.category?.toLowerCase() || '';
    const canonicalType = String(metadata.canonicalType || '').toUpperCase();

    const maybeRequire = (type: EvidenceType, needed: boolean, deferInPlanning = false) => {
      if (!needed) return;
      if (isPlanning && deferInPlanning) {
        deferred.push(type);
        return;
      }
      required.push(type);
    };

    maybeRequire(EvidenceType.OPENING_HOURS, this.needsOpeningHours(canonicalType, category));
    maybeRequire(
      EvidenceType.WEATHER,
      this.needsWeather(canonicalType, category, isWinter),
      true,
    );
    maybeRequire(
      EvidenceType.ROAD_CLOSURE,
      this.needsRoadClosure(canonicalType, category, isWinter),
      true,
    );
    maybeRequire(EvidenceType.BOOKING, this.needsBooking(canonicalType, category));

    return { required, deferred };
  }

  private needsOpeningHours(canonicalType: string, category: string): boolean {
    const typesNeedingHours = [
      'MUSEUM', 'SHOP', 'RESTAURANT', 'CAFE', 'SPA_POOL', 'HOT_SPRING',
      'VISITOR_CENTER', 'GAS_STATION', 'FUEL_STATION', 'SUPERMARKET',
    ];
    if (typesNeedingHours.some((t) => canonicalType.includes(t))) return true;
    return (
      category.includes('restaurant') ||
      category.includes('shop') ||
      (category.includes('attraction') &&
        !canonicalType.includes('WATERFALL') &&
        !canonicalType.includes('GLACIER') &&
        !canonicalType.includes('VOLCANO') &&
        !canonicalType.includes('GEYSER') &&
        !canonicalType.includes('NATIONAL_PARK'))
    );
  }

  private needsWeather(canonicalType: string, category: string, isWinter: boolean): boolean {
    if (
      canonicalType.includes('GLACIER') ||
      canonicalType.includes('VOLCANO') ||
      canonicalType.includes('TRAIL') ||
      canonicalType.includes('WATERFALL') ||
      canonicalType.includes('NATIONAL_PARK') ||
      canonicalType.includes('BEACH') ||
      category.includes('nature') ||
      category.includes('outdoor')
    ) {
      return true;
    }
    return isWinter && category.includes('attraction');
  }

  private needsRoadClosure(canonicalType: string, category: string, isWinter: boolean): boolean {
    const remoteTypes = ['HIGHLAND', 'F_ROAD', 'GLACIER', 'TRAILHEAD', 'CAMPING', 'REMOTE', 'MOUNTAIN_PASS'];
    if (remoteTypes.some((t) => canonicalType.includes(t))) return true;
    return isWinter && canonicalType.includes('NATIONAL_PARK');
  }

  private needsBooking(canonicalType: string, category: string): boolean {
    if (canonicalType.includes('HOTEL') || canonicalType.includes('SPA_POOL')) return true;
    return category.includes('accommodation') || category.includes('restaurant');
  }

  private isWinterSeason(tripStartDate?: string): boolean {
    if (!tripStartDate) return false;
    try {
      const month = new Date(tripStartDate).getUTCMonth() + 1;
      return month >= 11 || month <= 3;
    } catch {
      return false;
    }
  }

  private calculateImpact(missingTypes: EvidenceType[], place: Place): 'LOW' | 'MEDIUM' | 'HIGH' {
    if (missingTypes.includes(EvidenceType.ROAD_CLOSURE)) return 'HIGH';
    if (missingTypes.includes(EvidenceType.WEATHER)) {
      const category = place.category?.toUpperCase() || '';
      if (category === 'NATURE' || category === 'ADVENTURE') return 'HIGH';
      return 'MEDIUM';
    }
    if (missingTypes.includes(EvidenceType.OPENING_HOURS)) return 'MEDIUM';
    if (missingTypes.includes(EvidenceType.BOOKING)) return 'MEDIUM';
    return 'LOW';
  }

  private getMissingReason(
    missingTypes: EvidenceType[],
    place: Place,
    isPlanning: boolean,
  ): string {
    const reasons: string[] = [];
    const category = place.category?.toUpperCase() || '';

    if (missingTypes.includes(EvidenceType.OPENING_HOURS)) {
      reasons.push(category === 'RESTAURANT' ? '餐厅需要营业时间' : '需要营业时间信息');
    }
    if (missingTypes.includes(EvidenceType.WEATHER)) {
      reasons.push('需要天气信息');
    }
    if (missingTypes.includes(EvidenceType.ROAD_CLOSURE)) {
      reasons.push('需要道路/封路信息');
    }
    if (missingTypes.includes(EvidenceType.BOOKING)) {
      reasons.push('需要预订确认信息');
    }

    if (isPlanning && reasons.length === 0) {
      return '规划期暂不强制实时证据';
    }

    return reasons.join('、') || '缺少必要证据';
  }

  private generateRecommendations(
    missingEvidence: EvidenceCompletenessResult['missingEvidence'],
    _places: Place[],
  ): EvidenceCompletenessResult['recommendations'] {
    const recommendations: EvidenceCompletenessResult['recommendations'] = [];
    const typeGroups = new Map<EvidenceType, number[]>();

    for (const missing of missingEvidence) {
      for (const type of missing.missingTypes) {
        if (!typeGroups.has(type)) {
          typeGroups.set(type, []);
        }
        typeGroups.get(type)!.push(missing.poiId);
      }
    }

    for (const [type, poiIds] of typeGroups.entries()) {
      const highImpactCount = missingEvidence.filter(
        (m) => poiIds.includes(m.poiId) && m.impact === 'HIGH',
      ).length;

      recommendations.push({
        action: this.getActionDescription(type, poiIds.length),
        priority: highImpactCount > 0 ? 'HIGH' : 'MEDIUM',
        estimatedTime: this.estimateFetchTime(type, poiIds.length),
        evidenceTypes: [type],
        affectedPois: poiIds,
      });
    }

    recommendations.sort((a, b) => {
      const priorityOrder = { HIGH: 3, MEDIUM: 2, LOW: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });

    return recommendations;
  }

  private estimateFetchTime(type: EvidenceType, count: number): number {
    const baseTime: Record<EvidenceType, number> = {
      [EvidenceType.WEATHER]: 2,
      [EvidenceType.ROAD_CLOSURE]: 3,
      [EvidenceType.OPENING_HOURS]: 1,
      [EvidenceType.BOOKING]: 1,
      [EvidenceType.OTHER]: 1,
    };
    const perItemTime: Record<EvidenceType, number> = {
      [EvidenceType.WEATHER]: 1,
      [EvidenceType.ROAD_CLOSURE]: 1,
      [EvidenceType.OPENING_HOURS]: 0.5,
      [EvidenceType.BOOKING]: 0.5,
      [EvidenceType.OTHER]: 0.5,
    };
    return baseTime[type] + perItemTime[type] * count;
  }

  private getActionDescription(type: EvidenceType, count: number): string {
    const typeNames: Record<EvidenceType, string> = {
      [EvidenceType.WEATHER]: '天气数据',
      [EvidenceType.ROAD_CLOSURE]: '道路封闭信息',
      [EvidenceType.OPENING_HOURS]: '营业时间',
      [EvidenceType.BOOKING]: '预订确认信息',
      [EvidenceType.OTHER]: '其他证据',
    };
    return `为 ${count} 个 POI 获取${typeNames[type]}`;
  }
}
