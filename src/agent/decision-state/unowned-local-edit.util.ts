/**
 * LOCAL_EDIT 未进 MDS 时的观测钩子（decision_state_unowned_local_edit）。
 * 不新建 Decision Class；只记形态，等真实 Trip 重复后再定 ACTIVITY.ADD_TO_DAY 等。
 */

import { bumpDecisionStateDivergence } from './decision-state-divergence.util';

export type UnownedLocalEditObsV1 = {
  schema: 'tripnara.decision_state_unowned_local_edit@v1';
  message_fingerprint: string;
  cre_operation?: string;
  semantic_intent?: string;
  note: 'observe_only_no_new_decision_class';
};

export function noteUnownedLocalEdit(input: {
  message?: string | null;
  creOperation?: string | null;
  semanticIntent?: string | null;
  /** MDS 已接管则不应记 */
  mdsOwnsAsk?: boolean;
}): UnownedLocalEditObsV1 | null {
  if (input.mdsOwnsAsk) return null;
  const intent = String(input.semanticIntent ?? '');
  const cre = String(input.creOperation ?? '');
  const msg = String(input.message ?? '');
  const looksLocal =
    intent === 'LOCAL_EDIT' ||
    /ADD_ACTIVITY|REPLACE_ACTIVITY|MOVE_ACTIVITY|OPTIMIZE_DAY/i.test(cre) ||
    /(?:加到|加入|换掉|挪到|排到).{0,16}?(?:第\s*\d+\s*天|Day|行程)/i.test(msg);
  if (!looksLocal) return null;

  bumpDecisionStateDivergence('unowned.LOCAL_EDIT');
  const fp = msg.replace(/\s+/g, ' ').slice(0, 80);
  return {
    schema: 'tripnara.decision_state_unowned_local_edit@v1',
    message_fingerprint: fp,
    cre_operation: cre || undefined,
    semantic_intent: intent || undefined,
    note: 'observe_only_no_new_decision_class',
  };
}
