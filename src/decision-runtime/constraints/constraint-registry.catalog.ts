/**
 * Constraint Registry SSOT — canonical codes for shadow compare / ON rollout.
 * @see DECISION_RUNTIME_ROADMAP.md §4.2 C4
 */

export const CONSTRAINT_REGISTRY_VERSION = 'constraints@v1';

export type ConstraintCategory =
  | 'ROAD_ACCESS'
  | 'WEATHER'
  | 'DAILY_LOAD'
  | 'BUDGET'
  | 'POI_ACCESS'
  | 'GENERAL';

export type ConstraintDefaultLevel = 'BLOCK' | 'WARN' | 'INFO';

export interface ConstraintRegistryEntry {
  constraintCode: string;
  category: ConstraintCategory;
  severity: 'critical' | 'high' | 'medium' | 'low';
  defaultLevel: ConstraintDefaultLevel;
  repairability: 'auto' | 'manual' | 'none';
  userFacingTemplate: string;
  /** ISO country codes or '*' for global */
  destinationApplicability: string[];
}

/** P1 baseline — expand as pack rules and providers register. */
export const CONSTRAINT_REGISTRY_CATALOG: ConstraintRegistryEntry[] = [
  {
    constraintCode: 'ROAD_CLOSED',
    category: 'ROAD_ACCESS',
    severity: 'critical',
    defaultLevel: 'BLOCK',
    repairability: 'auto',
    userFacingTemplate: 'Road segment closed — reroute required',
    destinationApplicability: ['IS', 'NZ'],
  },
  {
    constraintCode: 'ROAD_STATUS',
    category: 'ROAD_ACCESS',
    severity: 'medium',
    defaultLevel: 'WARN',
    repairability: 'manual',
    userFacingTemplate: 'Road status uncertain — verify before travel',
    destinationApplicability: ['*'],
  },
  {
    constraintCode: 'ACTIVITY_PROHIBITED',
    category: 'WEATHER',
    severity: 'high',
    defaultLevel: 'BLOCK',
    repairability: 'auto',
    userFacingTemplate: 'Activity not safe under current weather',
    destinationApplicability: ['*'],
  },
  {
    constraintCode: 'WEATHER_STORM',
    category: 'WEATHER',
    severity: 'high',
    defaultLevel: 'WARN',
    repairability: 'manual',
    userFacingTemplate: 'Storm conditions may affect outdoor plans',
    destinationApplicability: ['*'],
  },
  {
    constraintCode: 'EXCESSIVE_DAILY_LOAD',
    category: 'DAILY_LOAD',
    severity: 'high',
    defaultLevel: 'BLOCK',
    repairability: 'auto',
    userFacingTemplate: 'Day schedule exceeds safe activity load',
    destinationApplicability: ['*'],
  },
  {
    constraintCode: 'DAILY_LOAD_EXCEEDED',
    category: 'DAILY_LOAD',
    severity: 'high',
    defaultLevel: 'BLOCK',
    repairability: 'auto',
    userFacingTemplate: 'Daily activity budget exceeded',
    destinationApplicability: ['*'],
  },
  {
    constraintCode: 'BUDGET_OVERRUN',
    category: 'BUDGET',
    severity: 'medium',
    defaultLevel: 'WARN',
    repairability: 'manual',
    userFacingTemplate: 'Plan exceeds budget threshold',
    destinationApplicability: ['*'],
  },
];

export interface ConstraintRegistrySnapshot {
  schemaId: 'tripnara.constraint_registry@v1';
  version: typeof CONSTRAINT_REGISTRY_VERSION;
  entryCount: number;
  entries: ConstraintRegistryEntry[];
}

export function snapshotConstraintRegistry(
  catalog: ConstraintRegistryEntry[] = CONSTRAINT_REGISTRY_CATALOG,
): ConstraintRegistrySnapshot {
  return {
    schemaId: 'tripnara.constraint_registry@v1',
    version: CONSTRAINT_REGISTRY_VERSION,
    entryCount: catalog.length,
    entries: catalog,
  };
}
