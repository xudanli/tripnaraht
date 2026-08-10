/**
 * Transport / Route Decision Classifier
 */

import {
  isExistingTripRouteOrderOptimizationQuery,
  isWestfjordsLegTransportPreferenceConsultation,
} from '../utils/orchestration-signals.util';
import type { RouteDecisionClass, TransportDecisionClass } from './decision-state.types';

export type TransportRouteDecisionClass = TransportDecisionClass | RouteDecisionClass;

export type TransportRouteClassification = {
  decisionClass: TransportRouteDecisionClass | null;
  confidence: number;
  reason: string;
};

const VEHICLE_FIT_RE =
  /(?:2\s*WD|两驱|四驱|4\s*WD|4x4|SUV).{0,20}?(?:F\s*-?\s*road|F路|高地|Þórsmörk|Thorsmork|能上|能不能|够不够|适不适合)|(?:F\s*-?\s*road|F路|高地).{0,20}?(?:2\s*WD|两驱|四驱|4\s*WD|车型|租车)/i;

const RENTAL_GUIDANCE_RE =
  /租车|车行|碎石险|砂石险|全险|免赔|F\s*-?\s*road|F路|自驾保险|car\s+rental|rent\s+a\s+car|Blue\s+Car|Lotus\s+Car/i;

export function isTransportRouteDecisionFamily(message: string, tripId?: string | null): boolean {
  const m = String(message ?? '');
  if (!m.trim()) return false;
  if (isExistingTripRouteOrderOptimizationQuery(tripId, m)) return true;
  if (isWestfjordsLegTransportPreferenceConsultation(m, m.toLowerCase())) return true;
  if (VEHICLE_FIT_RE.test(m) || RENTAL_GUIDANCE_RE.test(m)) return true;
  if (/(?:优化|重排).{0,12}?路线|路线顺序/i.test(m)) return true;
  return false;
}

export function classifyTransportRouteDecision(
  message: string,
  tripId?: string | null,
): TransportRouteClassification {
  const full = String(message ?? '').trim();
  if (!full || !isTransportRouteDecisionFamily(full, tripId)) {
    return { decisionClass: null, confidence: 0, reason: 'not_transport_route_family' };
  }

  if (
    isExistingTripRouteOrderOptimizationQuery(tripId, full) ||
    /(?:优化|重排|调整).{0,16}?(?:路线顺序|路线)|路线顺序/.test(full)
  ) {
    return {
      decisionClass: 'ROUTE.DAY_ORDER_OPTIMIZE',
      confidence: 0.9,
      reason: 'route_order_optimize_lex',
    };
  }

  if (VEHICLE_FIT_RE.test(full)) {
    return {
      decisionClass: 'TRANSPORT.VEHICLE_FIT',
      confidence: 0.92,
      reason: 'vehicle_fit_lex',
    };
  }

  if (
    RENTAL_GUIDANCE_RE.test(full) ||
    isWestfjordsLegTransportPreferenceConsultation(full, full.toLowerCase())
  ) {
    return {
      decisionClass: 'TRANSPORT.RENTAL_GUIDANCE',
      confidence: 0.88,
      reason: 'rental_guidance_lex',
    };
  }

  return {
    decisionClass: 'TRANSPORT.RENTAL_GUIDANCE',
    confidence: 0.55,
    reason: 'transport_family_default',
  };
}
