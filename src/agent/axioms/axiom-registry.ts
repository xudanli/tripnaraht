import type { AxiomId, AxiomSchema } from './axiom-schema';

/**
 * Agent Runtime Defensive Core v2.0 — registry (3 runtime guardians).
 * Distinct from optimization seven-axioms (`trips/decision/optimization/axioms/`).
 * See `src/agent/axioms/README.md` for SKU ↔ axiom ↔ cid mapping.
 */
export const AXIOM_REGISTRY: Record<AxiomId, AxiomSchema> = {
  TERRAIN_F_ROAD_UNFIT: {
    axiom_id: 'TERRAIN_F_ROAD_UNFIT',
    cid: 'terrain.f_road_compatibility',
    sim_label: 'TERRAIN_F_ROAD_UNFIT',
    real_label: 'TERRAIN_F_ROAD_UNFIT',
    severity: 'P0',
    evidence_schema: ['vehicle_type', 'requires_4wd', 'fatigue_slack'],
    utility_anchor: {
      expected_penalty: -10,
      actual_penalty: -10,
      tolerance: 2,
    },
  },
  FATIGUE_OVERLOAD: {
    axiom_id: 'FATIGUE_OVERLOAD',
    cid: 'human.fatigue_capacity',
    sim_label: 'FATIGUE_OVERLOAD',
    real_label: 'FATIGUE_OVERLOAD',
    severity: 'P1',
    evidence_schema: [
      'planned_duration_minutes',
      'max_daily_duration_minutes',
      'planned_walking_km',
      'max_walking_km',
      'fatigue_slack',
    ],
    utility_anchor: {
      expected_penalty: -25,
      actual_penalty: -25,
      tolerance: 5,
    },
  },
  ETA_INFEASIBLE: {
    axiom_id: 'ETA_INFEASIBLE',
    cid: 'time.eta_feasibility',
    sim_label: 'ETA_INFEASIBLE',
    real_label: 'ETA_INFEASIBLE',
    severity: 'P1',
    evidence_schema: [
      'arrival_time',
      'latest_allowed_arrival_time',
      'travel_time_minutes',
      'buffer_minutes',
      'eta_slack_minutes',
    ],
    utility_anchor: {
      expected_penalty: -20,
      actual_penalty: -20,
      tolerance: 5,
    },
  },
} as const;

export const AXIOMS: AxiomSchema[] = Object.values(AXIOM_REGISTRY);

