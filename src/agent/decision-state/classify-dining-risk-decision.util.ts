/**
 * Dining / Risk Decision Classifier
 */

import {
  isDiningRecommendationQuery,
  messageHasDiningLocationAnchor,
} from '../utils/trip-dining-consultation.util';
import {
  isDayPaceAssessmentQuery,
  isWeatherImpactOnItineraryQuery,
} from '../utils/orchestration-signals.util';
import { stripUiInjectedDayScheduleContext } from '../utils/ui-day-schedule-context.util';
import type { DiningDecisionClass, RiskDecisionClass } from './decision-state.types';

export type DiningRiskDecisionClass = DiningDecisionClass | RiskDecisionClass;

export type DiningRiskClassification = {
  decisionClass: DiningRiskDecisionClass | null;
  confidence: number;
  reason: string;
};

export function isDiningRiskDecisionFamily(message: string): boolean {
  const m = String(message ?? '');
  if (!m.trim()) return false;
  if (isDiningRecommendationQuery(m)) return true;
  if (isWeatherImpactOnItineraryQuery(m)) return true;
  if (isDayPaceAssessmentQuery(stripUiInjectedDayScheduleContext(m))) return true;
  if (/(?:太赶|节奏|会不会累|安排会不会紧)/i.test(m)) return true;
  return false;
}

export function classifyDiningRiskDecision(message: string): DiningRiskClassification {
  const full = String(message ?? '').trim();
  if (!full || !isDiningRiskDecisionFamily(full)) {
    return { decisionClass: null, confidence: 0, reason: 'not_dining_risk_family' };
  }

  const stripped = stripUiInjectedDayScheduleContext(full);

  if (isDayPaceAssessmentQuery(stripped) || /(?:会不会|是不是).{0,6}?太赶|节奏会不会/i.test(stripped)) {
    return {
      decisionClass: 'RISK.PACE_ASSESS',
      confidence: 0.93,
      reason: 'pace_assess_lex',
    };
  }

  if (isWeatherImpactOnItineraryQuery(full)) {
    return {
      decisionClass: 'RISK.WEATHER_IMPACT',
      confidence: 0.9,
      reason: 'weather_impact_lex',
    };
  }

  if (isDiningRecommendationQuery(full)) {
    if (messageHasDiningLocationAnchor(full)) {
      return {
        decisionClass: 'DINING.NEAR_POI',
        confidence: 0.9,
        reason: 'dining_near_poi_lex',
      };
    }
    return {
      decisionClass: 'DINING.RECOMMENDATION',
      confidence: 0.88,
      reason: 'dining_recommendation_lex',
    };
  }

  return { decisionClass: null, confidence: 0, reason: 'unclassified_dining_risk' };
}
