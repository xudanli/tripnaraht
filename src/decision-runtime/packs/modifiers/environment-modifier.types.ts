/**
 * RFC-002 Phase 2 — declarative environment modifier bundles.
 */

export interface EnvironmentModifierEntry {
  modifierId: string;
  domain: string;
  semanticKeys?: string[];
  parameters: Record<string, number | string | boolean>;
}

export interface EnvironmentModifierBundle {
  schemaId: string;
  modifiers: EnvironmentModifierEntry[];
}

export interface DrivingEnvironmentParams {
  baseSafeHours: number;
  defaultSpeedKmH: number;
}

export interface ActivityLoadEnvironmentParams {
  windExposureMultiplier: number;
  highlandFatigueFactor: number;
}

export const DEFAULT_ACTIVITY_LOAD_ENVIRONMENT: ActivityLoadEnvironmentParams = {
  windExposureMultiplier: 1,
  highlandFatigueFactor: 1,
};
