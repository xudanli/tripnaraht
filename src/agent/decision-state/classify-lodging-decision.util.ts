/**
 * Lodging Decision Classifier
 */

import { isLodgingGapDirectAnswerQuery } from '../harness/trip-lodging-coverage-fact.util';
import { isDayLodgingChoiceQuery } from '../utils/day-lodging-choice.util';
import { isHotelInventorySearchQuery } from '../utils/orchestration-signals.util';
import type { LodgingDecisionClass } from './decision-state.types';

export type LodgingDecisionClassification = {
  decisionClass: LodgingDecisionClass | null;
  confidence: number;
  reason: string;
};

export function isLodgingDecisionFamily(message: string): boolean {
  const m = String(message ?? '');
  if (isLodgingGapDirectAnswerQuery(m)) return true;
  if (isDayLodgingChoiceQuery(m)) return true;
  if (isHotelInventorySearchQuery(m)) return true;
  if (/住哪里|住哪|订酒店|找酒店|住宿缺口|没安排住宿/i.test(m)) return true;
  return false;
}

export function classifyLodgingDecision(message: string): LodgingDecisionClassification {
  const full = String(message ?? '').trim();
  if (!full || !isLodgingDecisionFamily(full)) {
    return { decisionClass: null, confidence: 0, reason: 'not_lodging_decision_family' };
  }

  if (isLodgingGapDirectAnswerQuery(full) || /住宿缺口|还缺住宿/i.test(full)) {
    return {
      decisionClass: 'LODGING.GAP_QUERY',
      confidence: 0.95,
      reason: 'lodging_gap_lex',
    };
  }

  /** 须先于 inventory：isHotelInventorySearchQuery 会吞掉 DayN 住哪 */
  if (isDayLodgingChoiceQuery(full) || /住哪里|住哪|今晚住|明天住/i.test(full)) {
    return {
      decisionClass: 'LODGING.NIGHT_CHOICE',
      confidence: 0.9,
      reason: 'lodging_night_choice_lex',
    };
  }

  if (isHotelInventorySearchQuery(full) || /(?:找|搜|订).{0,6}?(?:酒店|民宿|住宿)/i.test(full)) {
    return {
      decisionClass: 'LODGING.INVENTORY_SEARCH',
      confidence: 0.88,
      reason: 'lodging_inventory_lex',
    };
  }

  return {
    decisionClass: 'LODGING.GAP_QUERY',
    confidence: 0.55,
    reason: 'lodging_family_default_gap',
  };
}
