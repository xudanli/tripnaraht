// src/trips/readiness/engine/rule-engine.ts

/**
 * Rule Engine - 规则判定引擎
 * 
 * 支持条件判定：all/any/not/eq/in/containsAny/exists
 * 用于评估 Readiness Pack 中的规则是否触发
 */

import { Condition } from '../types/readiness-pack.types';
import { TripContext } from '../types/trip-context.types';

export class RuleEngine {
  /**
   * 评估条件是否满足
   */
  evaluate(condition: Condition | undefined | null, context: TripContext): boolean {
    // 如果条件为空，默认返回 false（不触发规则）
    if (!condition) {
      return false;
    }

    if (condition.all) {
      if (!Array.isArray(condition.all)) {
        return false;
      }
      // 过滤掉 undefined/null 的子条件
      const validConditions = condition.all.filter(c => c != null);
      if (validConditions.length === 0) {
        return false;
      }
      return validConditions.every(c => this.evaluate(c, context));
    }

    if (condition.any) {
      if (!Array.isArray(condition.any)) {
        return false;
      }
      // 过滤掉 undefined/null 的子条件
      const validConditions = condition.any.filter(c => c != null);
      if (validConditions.length === 0) {
        return false;
      }
      return validConditions.some(c => this.evaluate(c, context));
    }

    if (condition.not) {
      return !this.evaluate(condition.not, context);
    }

    if (condition.exists !== undefined) {
      return this.getPathValue(context, condition.exists) !== undefined;
    }

    if (condition.eq) {
      const actual = this.getPathValue(context, condition.eq.path);
      return actual === condition.eq.value;
    }

    if (condition.ne) {
      const actual = this.getPathValue(context, condition.ne.path);
      return actual !== condition.ne.value;
    }

    if (condition.gt) {
      const actual = this.getPathValue(context, condition.gt.path);
      return typeof actual === 'number' && actual > condition.gt.value;
    }

    if (condition.gte) {
      const actual = this.getPathValue(context, condition.gte.path);
      return typeof actual === 'number' && actual >= condition.gte.value;
    }

    if (condition.lt) {
      const actual = this.getPathValue(context, condition.lt.path);
      return typeof actual === 'number' && actual < condition.lt.value;
    }

    if (condition.lte) {
      const actual = this.getPathValue(context, condition.lte.path);
      return typeof actual === 'number' && actual <= condition.lte.value;
    }

    if (condition.in) {
      const actual = this.getPathValue(context, condition.in.path);
      return condition.in.values.includes(actual);
    }

    if (condition.containsAny) {
      const actual = this.getPathValue(context, condition.containsAny.path);
      if (!Array.isArray(actual)) {
        return false;
      }
      return condition.containsAny.values.some(v => actual.includes(v));
    }

    // 地理特征条件（便捷语法）
    if (condition.geo) {
      return this.evaluateGeoCondition(condition.geo, context);
    }

    // 如果没有匹配的条件类型，返回 false
    return false;
  }

  /**
   * 评估地理特征条件
   */
  private evaluateGeoCondition(geoCondition: NonNullable<Condition['geo']>, context: TripContext): boolean {
    const geo = context.geo;
    if (!geo) {
      return false; // 如果没有地理特征数据，返回 false
    }

    // 检查河流特征
    if (geoCondition.rivers) {
      const rivers = geo.rivers;
      if (!rivers) return false;
      
      if (geoCondition.rivers.nearRiver !== undefined && rivers.nearRiver !== geoCondition.rivers.nearRiver) {
        return false;
      }
      
      if (geoCondition.rivers.nearestRiverDistanceM) {
        const dist = rivers.nearestRiverDistanceM;
        if (dist === undefined) return false;
        if (geoCondition.rivers.nearestRiverDistanceM.gt !== undefined && dist <= geoCondition.rivers.nearestRiverDistanceM.gt) return false;
        if (geoCondition.rivers.nearestRiverDistanceM.gte !== undefined && dist < geoCondition.rivers.nearestRiverDistanceM.gte) return false;
        if (geoCondition.rivers.nearestRiverDistanceM.lt !== undefined && dist >= geoCondition.rivers.nearestRiverDistanceM.lt) return false;
        if (geoCondition.rivers.nearestRiverDistanceM.lte !== undefined && dist > geoCondition.rivers.nearestRiverDistanceM.lte) return false;
      }
      
      if (geoCondition.rivers.riverCrossingCount) {
        const count = rivers.riverCrossingCount;
        if (count === undefined) return false;
        if (geoCondition.rivers.riverCrossingCount.gt !== undefined && count <= geoCondition.rivers.riverCrossingCount.gt) return false;
        if (geoCondition.rivers.riverCrossingCount.gte !== undefined && count < geoCondition.rivers.riverCrossingCount.gte) return false;
        if (geoCondition.rivers.riverCrossingCount.lt !== undefined && count >= geoCondition.rivers.riverCrossingCount.lt) return false;
        if (geoCondition.rivers.riverCrossingCount.lte !== undefined && count > geoCondition.rivers.riverCrossingCount.lte) return false;
      }
      
      if (geoCondition.rivers.riverDensityScore) {
        const score = rivers.riverDensityScore;
        if (score === undefined) return false;
        if (geoCondition.rivers.riverDensityScore.gt !== undefined && score <= geoCondition.rivers.riverDensityScore.gt) return false;
        if (geoCondition.rivers.riverDensityScore.gte !== undefined && score < geoCondition.rivers.riverDensityScore.gte) return false;
        if (geoCondition.rivers.riverDensityScore.lt !== undefined && score >= geoCondition.rivers.riverDensityScore.lt) return false;
        if (geoCondition.rivers.riverDensityScore.lte !== undefined && score > geoCondition.rivers.riverDensityScore.lte) return false;
      }
    }

    // 检查山脉特征
    if (geoCondition.mountains) {
      const mountains = geo.mountains;
      if (!mountains) return false;
      
      if (geoCondition.mountains.inMountain !== undefined && mountains.inMountain !== geoCondition.mountains.inMountain) {
        return false;
      }
      
      if (geoCondition.mountains.mountainElevationAvg) {
        const elevation = mountains.mountainElevationAvg;
        if (elevation === undefined) return false;
        if (geoCondition.mountains.mountainElevationAvg.gt !== undefined && elevation <= geoCondition.mountains.mountainElevationAvg.gt) return false;
        if (geoCondition.mountains.mountainElevationAvg.gte !== undefined && elevation < geoCondition.mountains.mountainElevationAvg.gte) return false;
        if (geoCondition.mountains.mountainElevationAvg.lt !== undefined && elevation >= geoCondition.mountains.mountainElevationAvg.lt) return false;
        if (geoCondition.mountains.mountainElevationAvg.lte !== undefined && elevation > geoCondition.mountains.mountainElevationAvg.lte) return false;
      }
      
      if (geoCondition.mountains.hasMountainPass !== undefined && mountains.hasMountainPass !== geoCondition.mountains.hasMountainPass) {
        return false;
      }
    }

    // 检查道路特征
    if (geoCondition.roads) {
      const roads = geo.roads;
      if (!roads) return false;
      
      if (geoCondition.roads.roadDensityScore) {
        const score = roads.roadDensityScore;
        if (score === undefined) return false;
        if (geoCondition.roads.roadDensityScore.gt !== undefined && score <= geoCondition.roads.roadDensityScore.gt) return false;
        if (geoCondition.roads.roadDensityScore.gte !== undefined && score < geoCondition.roads.roadDensityScore.gte) return false;
        if (geoCondition.roads.roadDensityScore.lt !== undefined && score >= geoCondition.roads.roadDensityScore.lt) return false;
        if (geoCondition.roads.roadDensityScore.lte !== undefined && score > geoCondition.roads.roadDensityScore.lte) return false;
      }
      
      if (geoCondition.roads.hasMountainPass !== undefined && roads.hasMountainPass !== geoCondition.roads.hasMountainPass) {
        return false;
      }
    }

    // 检查海岸线特征
    if (geoCondition.coastlines) {
      const coastlines = geo.coastlines;
      if (!coastlines) return false;
      
      if (geoCondition.coastlines.isCoastalArea !== undefined && coastlines.isCoastalArea !== geoCondition.coastlines.isCoastalArea) {
        return false;
      }
    }

    // 检查 POI 特征
    if (geoCondition.pois) {
      const pois = geo.pois;
      if (!pois) return false;
      
      if (geoCondition.pois.hasHarbour !== undefined && pois.hasHarbour !== geoCondition.pois.hasHarbour) {
        return false;
      }
      
      if (geoCondition.pois.hasEVCharger !== undefined && pois.hasEVCharger !== geoCondition.pois.hasEVCharger) {
        return false;
      }
      
      if (geoCondition.pois.hasFerryTerminal !== undefined && pois.hasFerryTerminal !== geoCondition.pois.hasFerryTerminal) {
        return false;
      }
      
      if (geoCondition.pois.supplyDensity) {
        const density = pois.supplyDensity;
        if (density === undefined) return false;
        if (geoCondition.pois.supplyDensity.gt !== undefined && density <= geoCondition.pois.supplyDensity.gt) return false;
        if (geoCondition.pois.supplyDensity.gte !== undefined && density < geoCondition.pois.supplyDensity.gte) return false;
        if (geoCondition.pois.supplyDensity.lt !== undefined && density >= geoCondition.pois.supplyDensity.lt) return false;
        if (geoCondition.pois.supplyDensity.lte !== undefined && density > geoCondition.pois.supplyDensity.lte) return false;
      }
      
      if (geoCondition.pois.hasCheckpoint !== undefined && pois.hasCheckpoint !== geoCondition.pois.hasCheckpoint) {
        return false;
      }
      
      if (geoCondition.pois.safety) {
        const safety = pois.safety;
        if (!safety) return false;
        if (geoCondition.pois.safety.hasHospital !== undefined && safety.hasHospital !== geoCondition.pois.safety.hasHospital) {
          return false;
        }
        if (geoCondition.pois.safety.hasPolice !== undefined && safety.hasPolice !== geoCondition.pois.safety.hasPolice) {
          return false;
        }
      }
      
      if (geoCondition.pois.supply) {
        const supply = pois.supply;
        if (!supply) return false;
        if (geoCondition.pois.supply.hasFuel !== undefined && supply.hasFuel !== geoCondition.pois.supply.hasFuel) {
          return false;
        }
        if (geoCondition.pois.supply.hasSupermarket !== undefined && supply.hasSupermarket !== geoCondition.pois.supply.hasSupermarket) {
          return false;
        }
      }
    }

    // 检查西藏特有特征
    if (geoCondition.altitude_m) {
      const altitude = geo.altitude_m;
      if (altitude === undefined) return false;
      if (geoCondition.altitude_m.gt !== undefined && altitude <= geoCondition.altitude_m.gt) return false;
      if (geoCondition.altitude_m.gte !== undefined && altitude < geoCondition.altitude_m.gte) return false;
      if (geoCondition.altitude_m.lt !== undefined && altitude >= geoCondition.altitude_m.lt) return false;
      if (geoCondition.altitude_m.lte !== undefined && altitude > geoCondition.altitude_m.lte) return false;
    }

    if (geoCondition.fuelDensity) {
      const density = geo.fuelDensity;
      if (density === undefined) return false;
      if (geoCondition.fuelDensity.gt !== undefined && density <= geoCondition.fuelDensity.gt) return false;
      if (geoCondition.fuelDensity.gte !== undefined && density < geoCondition.fuelDensity.gte) return false;
      if (geoCondition.fuelDensity.lt !== undefined && density >= geoCondition.fuelDensity.lt) return false;
      if (geoCondition.fuelDensity.lte !== undefined && density > geoCondition.fuelDensity.lte) return false;
    }

    if (geoCondition.checkpointCount) {
      const count = geo.checkpointCount;
      if (count === undefined) return false;
      if (geoCondition.checkpointCount.gt !== undefined && count <= geoCondition.checkpointCount.gt) return false;
      if (geoCondition.checkpointCount.gte !== undefined && count < geoCondition.checkpointCount.gte) return false;
      if (geoCondition.checkpointCount.lt !== undefined && count >= geoCondition.checkpointCount.lt) return false;
      if (geoCondition.checkpointCount.lte !== undefined && count > geoCondition.checkpointCount.lte) return false;
    }

    if (geoCondition.mountainPassCount) {
      const count = geo.mountainPassCount;
      if (count === undefined) return false;
      if (geoCondition.mountainPassCount.gt !== undefined && count <= geoCondition.mountainPassCount.gt) return false;
      if (geoCondition.mountainPassCount.gte !== undefined && count < geoCondition.mountainPassCount.gte) return false;
      if (geoCondition.mountainPassCount.lt !== undefined && count >= geoCondition.mountainPassCount.lt) return false;
      if (geoCondition.mountainPassCount.lte !== undefined && count > geoCondition.mountainPassCount.lte) return false;
    }

    if (geoCondition.oxygenStationCount) {
      const count = geo.oxygenStationCount;
      if (count === undefined) return false;
      if (geoCondition.oxygenStationCount.gt !== undefined && count <= geoCondition.oxygenStationCount.gt) return false;
      if (geoCondition.oxygenStationCount.gte !== undefined && count < geoCondition.oxygenStationCount.gte) return false;
      if (geoCondition.oxygenStationCount.lt !== undefined && count >= geoCondition.oxygenStationCount.lt) return false;
      if (geoCondition.oxygenStationCount.lte !== undefined && count > geoCondition.oxygenStationCount.lte) return false;
    }

    if (geoCondition.latitude) {
      const lat = geo.latitude;
      if (lat === undefined) return false;
      if (geoCondition.latitude.gt !== undefined && lat <= geoCondition.latitude.gt) return false;
      if (geoCondition.latitude.gte !== undefined && lat < geoCondition.latitude.gte) return false;
      if (geoCondition.latitude.lt !== undefined && lat >= geoCondition.latitude.lt) return false;
      if (geoCondition.latitude.lte !== undefined && lat > geoCondition.latitude.lte) return false;
    }

    if (geoCondition.longitude) {
      const lng = geo.longitude;
      if (lng === undefined) return false;
      if (geoCondition.longitude.gt !== undefined && lng <= geoCondition.longitude.gt) return false;
      if (geoCondition.longitude.gte !== undefined && lng < geoCondition.longitude.gte) return false;
      if (geoCondition.longitude.lt !== undefined && lng >= geoCondition.longitude.lt) return false;
      if (geoCondition.longitude.lte !== undefined && lng > geoCondition.longitude.lte) return false;
    }

    return true; // 所有地理特征条件都满足
  }

  /**
   * 从上下文中获取路径值
   * 支持点号分隔的嵌套路径，如 "traveler.nationality", "itinerary.activities"
   */
  private getPathValue(context: TripContext, path: string): any {
    const parts = path.split('.');
    let value: any = context;

    for (const part of parts) {
      if (value === null || value === undefined) {
        return undefined;
      }
      value = value[part];
    }

    return value;
  }

  /**
   * 检查规则是否适用于当前上下文
   * 考虑 appliesTo 中的 seasons, activities, travelerTags
   */
  isRuleApplicable(
    rule: { appliesTo?: { seasons?: string[]; activities?: string[]; travelerTags?: string[] } },
    context: TripContext
  ): boolean {
    if (!rule.appliesTo) {
      return true; // 没有限制，适用于所有情况
    }

    // 检查季节
    if (rule.appliesTo.seasons && rule.appliesTo.seasons.length > 0) {
      if (!context.itinerary.season) {
        return false; // 需要季节信息但没有提供
      }
      if (!rule.appliesTo.seasons.includes(context.itinerary.season) && 
          !rule.appliesTo.seasons.includes('all')) {
        return false;
      }
    }

    // 检查活动
    if (rule.appliesTo.activities && rule.appliesTo.activities.length > 0) {
      const itineraryActivities = context.itinerary.activities || [];
      const hasMatchingActivity = rule.appliesTo.activities.some(activity =>
        itineraryActivities.includes(activity)
      );
      if (!hasMatchingActivity) {
        return false;
      }
    }

    // 检查旅行者标签
    if (rule.appliesTo.travelerTags && rule.appliesTo.travelerTags.length > 0) {
      const travelerTags = context.traveler.tags || [];
      const hasMatchingTag = rule.appliesTo.travelerTags.some(tag =>
        travelerTags.includes(tag)
      );
      if (!hasMatchingTag) {
        return false;
      }
    }

    return true;
  }
}

