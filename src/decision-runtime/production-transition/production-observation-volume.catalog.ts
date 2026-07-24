/**
 * Minimum production sample thresholds — dual gate with 30d calendar window.
 * Low traffic must extend observation; calendar alone does not auto-pass.
 */

export const PRODUCTION_OBSERVATION_VOLUME_SCHEMA_ID =
  'tripnara.production_observation_volume_thresholds@v1';

export interface ProductionObservationVolumeThreshold {
  metricId: string;
  label: string;
  minValue: number;
  collectionHint: string;
}

export const PRODUCTION_OBSERVATION_VOLUME_THRESHOLDS: ProductionObservationVolumeThreshold[] =
  [
    {
      metricId: 'volume.formal-trigger-requests',
      label: 'Formal Trigger requests',
      minValue: 500,
      collectionHint: 'tripnara_decision_trigger_dispatch_total or access log',
    },
    {
      metricId: 'volume.canonical-shadow-dispatches',
      label: 'Canonical shadow dispatches',
      minValue: 500,
      collectionHint: 'Gateway dispatch + shadow decision runs',
    },
    {
      metricId: 'volume.constraint-comparisons',
      label: 'Constraint SHADOW_COMPARE evaluations',
      minValue: 300,
      collectionHint: 'tripnara_constraint_shadow_compared_total',
    },
    {
      metricId: 'volume.authorization-evaluations',
      label: 'Authorization Gateway evaluations',
      minValue: 100,
      collectionHint: 'Authorization audit / ledger',
    },
    {
      metricId: 'volume.effective-plan-executions',
      label: 'Effective Plan executions',
      minValue: 50,
      collectionHint: 'Execution ledger',
    },
    {
      metricId: 'volume.monitoring-events',
      label: 'Monitoring events processed',
      minValue: 50,
      collectionHint: 'Detector events + dedup metrics',
    },
  ];

export const PRODUCTION_OBSERVATION_COVERAGE_THRESHOLDS = {
  coreScenariosMin: 7,
  destinationPacksMin: 1,
  fallbackDrillsMin: 1,
} as const;

export interface ProductionObservationVolumeSnapshot {
  formalTriggerRequests?: number;
  canonicalShadowDispatches?: number;
  constraintComparisons?: number;
  authorizationEvaluations?: number;
  effectivePlanExecutions?: number;
  monitoringEvents?: number;
  coreScenariosCovered?: number;
  destinationPacksCovered?: number;
  fallbackDrillsCompleted?: number;
}
