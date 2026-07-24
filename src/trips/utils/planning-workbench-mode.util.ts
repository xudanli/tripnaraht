export type PlanningWorkbenchMode = 'manual' | 'copilot';

export const PLANNING_WORKBENCH_METADATA_KEY = 'planningWorkbench';

export function readPlanningWorkbenchMode(metadata: unknown): PlanningWorkbenchMode {
  const root = (metadata as Record<string, unknown> | null) ?? {};
  const slice = root[PLANNING_WORKBENCH_METADATA_KEY] as Record<string, unknown> | undefined;
  return slice?.mode === 'copilot' ? 'copilot' : 'manual';
}
