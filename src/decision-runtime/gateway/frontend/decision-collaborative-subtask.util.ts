/**
 * FE-facing helpers for Decision Collaborative Sub-tasks.
 * Import from @/generated/unified-decision-contracts in frontend.
 */

import type {
  DecisionCollaborativeSubTaskStatus,
  DecisionCollaborativeFollowUpSuggestion,
} from '../contracts/unified-decision-ui.types';
import { buildSuggestedSubTasks } from '../utils/decision-collaborative-subtask-suggestions.util';

export { buildSuggestedSubTasks };

export type { DecisionCollaborativeFollowUpSuggestion };

/** UI dropdown options — PATCH body uses English enum values. */
export const DECISION_COLLAB_SUBTASK_STATUS_OPTIONS: Array<{
  value: DecisionCollaborativeSubTaskStatus;
  label: string;
}> = [
  { value: 'pending', label: '待处理' },
  { value: 'in_progress', label: '进行中' },
  { value: 'completed', label: '已完成' },
  { value: 'cancelled', label: '已取消' },
];

export function labelForCollaborativeSubTaskStatus(
  status: DecisionCollaborativeSubTaskStatus,
): string {
  return (
    DECISION_COLLAB_SUBTASK_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status
  );
}

/**
 * Preview follow-ups for submit step — same rules as apply auto-seed.
 * Use in tests and DecisionCollaborativeSubTasksPanel preview before apply.
 */
export function previewCollaborativeFollowUps(
  semanticKey?: string,
): DecisionCollaborativeFollowUpSuggestion[] {
  return buildSuggestedSubTasks(semanticKey);
}
