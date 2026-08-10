import type { ConversationCardKind } from './conversation-turn-result.constants';
import type { ConversationLifecycle } from './conversation-turn-result.constants';

/**
 * Phase 3：同话术在不同生命周期下的 primary_card 偏好（不扩意图词典）。
 */
export function preferPrimaryCardForLifecycle(params: {
  lifecycle: ConversationLifecycle;
  /** 已有候选 kinds */
  available: ConversationCardKind[];
  travelingExecutionFocus?: boolean;
}): ConversationCardKind | undefined {
  const { lifecycle, available, travelingExecutionFocus } = params;
  if (!available.length) return undefined;

  if (lifecycle === 'TRAVELING' || travelingExecutionFocus) {
    const order: ConversationCardKind[] = [
      'apply_receipt',
      'gate_risk',
      'change_draft',
      'decision_options',
      'team_action',
      'trip_fact',
      'import_preview',
    ];
    for (const k of order) if (available.includes(k)) return k;
  }

  if (lifecycle === 'COMPLETED') {
    const order: ConversationCardKind[] = [
      'apply_receipt',
      'trip_fact',
      'team_action',
      'decision_options',
    ];
    for (const k of order) if (available.includes(k)) return k;
  }

  // PLANNING / UNKNOWN：规划与草案优先
  const order: ConversationCardKind[] = [
    'apply_receipt',
    'import_preview',
    'change_draft',
    'decision_options',
    'gate_risk',
    'team_action',
    'trip_fact',
  ];
  for (const k of order) if (available.includes(k)) return k;
  return available[0];
}
