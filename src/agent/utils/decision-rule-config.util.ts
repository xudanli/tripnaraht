import type { DecisionRuleConfig } from '@prisma/client';
import { HARD_TRUTH_GLOBAL_ACTION, HARD_TRUTH_HANDLER_PREFIX } from '../constants/hard-truth-rule.constants';

export function isHardTruthDecisionRuleRow(row: Pick<DecisionRuleConfig, 'actionName' | 'handlerId'>): boolean {
  return String(row.actionName ?? '') === HARD_TRUTH_GLOBAL_ACTION && String(row.handlerId ?? '').startsWith(HARD_TRUTH_HANDLER_PREFIX);
}

export function filterSideEffectDecisionRuleRows<T extends Pick<DecisionRuleConfig, 'actionName' | 'handlerId'>>(rows: T[]): T[] {
  return rows.filter((r) => !isHardTruthDecisionRuleRow(r));
}
