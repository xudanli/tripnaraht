import type { StoredDecisionCollaborativeSubTask } from '../persistence/decision-collaborative-subtask.store';

export const DECISION_COLLABORATIVE_SUBTASKS_METADATA_KEY = 'decisionProblemCollaborativeSubTasks';

export function readCollaborativeSubTasksFromMetadata(
  metadata: unknown,
): StoredDecisionCollaborativeSubTask[] {
  const root = (metadata ?? {}) as Record<string, unknown>;
  const raw = root[DECISION_COLLABORATIVE_SUBTASKS_METADATA_KEY] as
    | { items?: StoredDecisionCollaborativeSubTask[] }
    | undefined;
  return [...(raw?.items ?? [])];
}
