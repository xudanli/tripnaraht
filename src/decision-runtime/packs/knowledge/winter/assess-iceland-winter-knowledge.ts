/**
 * Project structured winter facts → assessments.
 * No free-text scrape; missing plow/hours stay UNKNOWN.
 */

import type { SourceReference } from '../iceland-knowledge.types';
import { loadIcelandSnowPlowPolicy } from './iceland-snow-plow.loader';
import type {
  ActivityWinterRiskAssessment,
  ActivityWinterRiskInput,
  AttractionWinterAccessAssessment,
  AttractionWinterAccessInput,
  IcelandWinterKnowledgeAssessments,
  IcelandWinterKnowledgeInput,
  LodgingHoursAssessment,
  LodgingHoursInput,
  PlowServiceBand,
  SnowPlowDelayAssessment,
  SnowPlowDelayInput,
} from './iceland-winter-knowledge.types';

const POI_EVIDENCE: SourceReference = {
  kind: 'PACK_FILE',
  path: 'knowledge/poi-access/is-attraction-winter-access.json',
  version: '0.1.0',
};

const ACTIVITY_EVIDENCE: SourceReference = {
  kind: 'PACK_FILE',
  path: 'knowledge/activity/is-winter-activity-cancel-patterns.json',
  version: '0.1.0',
};

const PLOW_EVIDENCE: SourceReference = {
  kind: 'PACK_FILE',
  path: 'knowledge/road/is-snow-plow-policy.json',
  version: '0.1.0',
};

const LODGING_EVIDENCE: SourceReference = {
  kind: 'PACK_FILE',
  path: 'knowledge/supply/is-winter-hours-uncertainty.json',
  version: '0.1.0',
};

export function assessAttractionWinterAccess(
  input: AttractionWinterAccessInput,
): AttractionWinterAccessAssessment {
  const reasons = [...(input.reasons ?? [])];
  let gate: AttractionWinterAccessAssessment['gate'] = 'ALLOW';
  const recommendedActions: string[] = [];

  if (input.status === 'CLOSED' && input.enforcement === 'HARD') {
    gate = 'BLOCK';
    reasons.push('ATTRACTION_WINTER_HARD_CLOSED');
    recommendedActions.push('REPLACE_ATTRACTION_OR_DAY');
  } else if (
    input.status === 'CLOSED' ||
    input.status === 'PENDING_CONFIRMATION' ||
    input.status === 'UNKNOWN'
  ) {
    gate = 'NEED_CONFIRM';
    reasons.push(`ATTRACTION_WINTER_${input.status}`);
    recommendedActions.push('CONFIRM_ATTRACTION_WINTER_ACCESS');
  }

  return {
    poiId: input.poiId,
    status: input.status,
    enforcement: input.enforcement,
    reasons: [...new Set(reasons)],
    gate,
    recommendedActions,
    evidence: [POI_EVIDENCE],
  };
}

export function assessActivityWinterRisk(
  input: ActivityWinterRiskInput,
): ActivityWinterRiskAssessment {
  const sessionStatus = input.sessionStatus ?? 'UNKNOWN';
  const cancelReasonCodes = [...(input.cancelReasonCodes ?? [])];
  const reasons: string[] = [];
  const recommendedActions: string[] = [];
  let gate: ActivityWinterRiskAssessment['gate'] = 'ALLOW';

  if (sessionStatus === 'CANCELLED') {
    gate = 'REPLAN_REQUIRED';
    reasons.push('ACTIVITY_SESSION_CANCELLED');
    recommendedActions.push('REPLACE_ACTIVITY_OR_DAY');
  } else if (sessionStatus === 'WEATHER_HOLD') {
    gate = 'NEED_CONFIRM';
    reasons.push('ACTIVITY_WEATHER_HOLD');
    recommendedActions.push('CONFIRM_ACTIVITY_WEATHER_HOLD');
  } else if (
    input.weatherDependency === 'HIGH' ||
    input.weatherDependency === 'CRITICAL'
  ) {
    gate = 'NEED_CONFIRM';
    reasons.push('ACTIVITY_HIGH_WEATHER_DEPENDENCY');
    recommendedActions.push('CONFIRM_WEATHER_SENSITIVE_ACTIVITY');
  } else if (sessionStatus === 'UNKNOWN' && cancelReasonCodes.length > 0) {
    gate = 'NEED_CONFIRM';
    reasons.push('ACTIVITY_CANCEL_PATTERN_PRESENT');
    recommendedActions.push('MONITOR_ACTIVITY_SESSION_STATUS');
  }

  return {
    experienceCode: input.experienceCode,
    weatherDependency: input.weatherDependency,
    cancelReasonCodes,
    sessionStatus,
    gate,
    reasons,
    recommendedActions,
    evidence: [ACTIVITY_EVIDENCE],
  };
}

export function assessSnowPlowDelay(
  input: SnowPlowDelayInput,
): SnowPlowDelayAssessment {
  const policy = loadIcelandSnowPlowPolicy();
  let band: PlowServiceBand = input.plowServiceBand ?? 'UNKNOWN';
  let delay = input.plowDelayRangeMin;
  const reasons: string[] = [];
  const recommendedActions: string[] = [];
  let gate: SnowPlowDelayAssessment['gate'] = 'ALLOW';

  if (input.plowRuleCode && policy.plowRuleCodes[input.plowRuleCode]) {
    const cell = policy.plowRuleCodes[input.plowRuleCode];
    band = cell.serviceBand;
    if (!delay && cell.delayRangeMinutes) {
      delay = [...cell.delayRangeMinutes] as [number, number];
    }
  }

  if (band === 'NOT_PLOWED') {
    gate = 'NEED_CONFIRM';
    reasons.push('ROAD_NOT_PLOWED');
    recommendedActions.push('CONFIRM_UNPLOWED_ROAD_ACCEPTABLE');
    recommendedActions.push('END_DAY_EARLIER');
  } else if (band === 'UNKNOWN') {
    gate = 'NEED_CONFIRM';
    reasons.push('PLOW_STATUS_UNKNOWN');
    recommendedActions.push('VERIFY_LIVE_PLOW_STATUS');
  } else if (band === 'REDUCED') {
    gate = 'NEED_CONFIRM';
    reasons.push('PLOW_SERVICE_REDUCED');
    recommendedActions.push('ALLOW_PLOW_DELAY_BUFFER');
  }

  return {
    roadSegmentId: input.roadSegmentId,
    plowRuleCode: input.plowRuleCode,
    plowServiceBand: band,
    plowDelayRangeMin: delay,
    gate,
    reasons,
    recommendedActions,
    evidence: [PLOW_EVIDENCE],
  };
}

export function assessLodgingHours(
  input: LodgingHoursInput,
): LodgingHoursAssessment {
  const hoursUnknown =
    input.hoursUnknown === true || input.openingMode === 'UNKNOWN';
  const reasons: string[] = [];
  const recommendedActions: string[] = [];
  let gate: LodgingHoursAssessment['gate'] = 'ALLOW';

  if (hoursUnknown) {
    gate = 'NEED_CONFIRM';
    reasons.push('LODGING_HOURS_UNKNOWN');
    recommendedActions.push('CONFIRM_CHECK_IN_WINDOW');
  } else if (input.openingMode === 'SEASONAL_REDUCED') {
    gate = 'NEED_CONFIRM';
    reasons.push('LODGING_SEASONAL_REDUCED_HOURS');
    recommendedActions.push('CONFIRM_WINTER_CHECK_IN');
  }

  return {
    openingMode: input.openingMode,
    latestArrivalLocalMin: input.latestArrivalLocalMin,
    hoursUnknown,
    gate,
    reasons,
    recommendedActions,
    evidence: [LODGING_EVIDENCE],
  };
}

export function assessIcelandWinterKnowledge(
  input: IcelandWinterKnowledgeInput,
): IcelandWinterKnowledgeAssessments {
  return {
    attractionAccess: input.attractionAccess
      ? assessAttractionWinterAccess(input.attractionAccess)
      : undefined,
    activityRisk: input.activityRisk
      ? assessActivityWinterRisk(input.activityRisk)
      : undefined,
    snowPlow: input.snowPlow
      ? assessSnowPlowDelay(input.snowPlow)
      : undefined,
    lodging: input.lodging ? assessLodgingHours(input.lodging) : undefined,
  };
}
