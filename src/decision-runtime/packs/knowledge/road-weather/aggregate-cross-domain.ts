/**
 * Cross-domain aggregation — do not ALLOW when each slice is only "barely ok".
 */

import type { SourceReference } from '../iceland-knowledge.types';
import type {
  CrossDomainAggregateInput,
  CrossDomainAggregateResult,
  CrossDomainAggregateStatus,
} from './iceland-road-weather.types';

function worse(
  a: CrossDomainAggregateStatus,
  b: CrossDomainAggregateStatus,
): CrossDomainAggregateStatus {
  const rank: Record<CrossDomainAggregateStatus, number> = {
    ALLOW: 0,
    NEED_CONFIRM: 1,
    REPLAN_REQUIRED: 2,
    BLOCK: 3,
  };
  return rank[a] >= rank[b] ? a : b;
}

export function aggregateIcelandSelfDriveDomains(
  input: CrossDomainAggregateInput,
): CrossDomainAggregateResult {
  let status: CrossDomainAggregateStatus = 'ALLOW';
  const reasons: string[] = [];
  const recommendedActions: string[] = [];
  const evidence: SourceReference[] = [];

  const fit = input.vehicleRoadFit;
  if (fit) {
    evidence.push(...fit.evidence);
    if (fit.gate === 'REJECT' || fit.status === 'INCOMPATIBLE') {
      status = worse(status, 'BLOCK');
      reasons.push('VEHICLE_ROAD_INCOMPATIBLE');
      recommendedActions.push('REPLACE_VEHICLE_OR_ROUTE');
    } else if (fit.gate === 'SUGGEST_REPLACE') {
      status = worse(status, 'REPLAN_REQUIRED');
      reasons.push('VEHICLE_ROAD_SUGGEST_REPLACE');
      recommendedActions.push('SUGGEST_REPLACE_VEHICLE_OR_SEGMENT');
    } else if (fit.gate === 'NEED_CONFIRM' || fit.status === 'CONDITIONAL') {
      status = worse(status, 'NEED_CONFIRM');
      reasons.push('VEHICLE_ROAD_CONDITIONAL');
      recommendedActions.push(...fit.conditionsToProceed);
    }
  }

  const weather = input.weatherImpact;
  if (weather) {
    evidence.push(...weather.evidence);
    const rs = weather.impacts.routeSafety?.status;
    if (rs === 'BLOCK') {
      status = worse(status, 'BLOCK');
      reasons.push('WEATHER_ROUTE_BLOCK');
      recommendedActions.push(...weather.recommendedActions);
    } else if (rs === 'WARN') {
      status = worse(status, 'NEED_CONFIRM');
      reasons.push('WEATHER_ROUTE_WARN');
      recommendedActions.push(...weather.recommendedActions);
    }
  }

  if (input.fuelStatus === 'BLOCK') {
    status = worse(status, 'BLOCK');
    reasons.push('FUEL_BLOCK');
    recommendedActions.push('EXECUTE_RUNBOOK_FUEL_INSUFFICIENT');
  } else if (input.fuelStatus === 'WARN') {
    status = worse(status, 'NEED_CONFIRM');
    reasons.push('FUEL_WARN');
  }

  const daylight = input.daylightLoad;
  if (daylight) {
    evidence.push(...daylight.evidence);
    if (daylight.gate !== 'ALLOW') {
      status = worse(status, daylight.gate);
      reasons.push(...daylight.reasons);
      recommendedActions.push(...daylight.recommendedActions);
    }
  }

  const winter = input.winter;
  if (winter?.attractionAccess) {
    evidence.push(...winter.attractionAccess.evidence);
    if (winter.attractionAccess.gate !== 'ALLOW') {
      status = worse(status, winter.attractionAccess.gate);
      reasons.push(...winter.attractionAccess.reasons);
      recommendedActions.push(...winter.attractionAccess.recommendedActions);
    }
  }
  if (winter?.activityRisk) {
    evidence.push(...winter.activityRisk.evidence);
    if (winter.activityRisk.gate !== 'ALLOW') {
      status = worse(status, winter.activityRisk.gate);
      reasons.push(...winter.activityRisk.reasons);
      recommendedActions.push(...winter.activityRisk.recommendedActions);
    }
  }
  if (winter?.snowPlow) {
    evidence.push(...winter.snowPlow.evidence);
    if (winter.snowPlow.gate !== 'ALLOW') {
      status = worse(status, winter.snowPlow.gate);
      reasons.push(...winter.snowPlow.reasons);
      recommendedActions.push(...winter.snowPlow.recommendedActions);
    }
  }
  if (winter?.lodging) {
    evidence.push(...winter.lodging.evidence);
    if (winter.lodging.gate !== 'ALLOW') {
      status = worse(status, winter.lodging.gate);
      reasons.push(...winter.lodging.reasons);
      recommendedActions.push(...winter.lodging.recommendedActions);
    }
  }

  // Combination rule: F-road LIMITED + wind escalate + fuel unknown reliability
  // must not stay ALLOW even if each alone is "conditional ok"
  const conditionalCount = [
    fit?.status === 'CONDITIONAL' || fit?.gate === 'NEED_CONFIRM',
    weather?.impacts.routeSafety?.status === 'WARN',
    input.fuelStatus === 'WARN' || input.fuelReliabilityUnknown,
    daylight?.gate === 'NEED_CONFIRM',
    winter?.lodging?.gate === 'NEED_CONFIRM' ||
      winter?.snowPlow?.gate === 'NEED_CONFIRM' ||
      winter?.attractionAccess?.gate === 'NEED_CONFIRM',
  ].filter(Boolean).length;

  if (conditionalCount >= 3 && status !== 'BLOCK') {
    status = worse(status, 'REPLAN_REQUIRED');
    reasons.push('CROSS_DOMAIN_STACKED_CONDITIONAL');
    recommendedActions.push('REPLAN_REQUIRED_DO_NOT_ALLOW');
  } else if (conditionalCount >= 2 && status === 'ALLOW') {
    status = 'NEED_CONFIRM';
    reasons.push('CROSS_DOMAIN_MULTI_CONDITIONAL');
  }

  return {
    status,
    reasons: [...new Set(reasons)],
    recommendedActions: [...new Set(recommendedActions)],
    evidence,
  };
}
