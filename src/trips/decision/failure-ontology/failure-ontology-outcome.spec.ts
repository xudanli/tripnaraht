import type { OpsRealityOutcomePayloadV1 } from '../observability/ops-reality-audit-payload';
import { OPS_REALITY_OUTCOME_SCHEMA } from '../observability/ops-reality-audit-payload';
import {
  coerceFailureOntologyPayload,
  mergeFailureOntologyIntoOutcome,
  parseFailureOntologyFromOutcome,
} from './failure-ontology-outcome';
import { FAILURE_ONTOLOGY_SCHEMA, OPS_REALITY_OUTCOME_EXTENSION_KEY } from './failure-ontology.types';

describe('failure-ontology-outcome', () => {
  const baseOutcome: OpsRealityOutcomePayloadV1 = {
    schema: OPS_REALITY_OUTCOME_SCHEMA,
    recordedAtIso: new Date().toISOString(),
    summary: 'test',
  };

  it('parseFailureOntologyFromOutcome returns null when absent', () => {
    expect(parseFailureOntologyFromOutcome(baseOutcome)).toBeNull();
    expect(parseFailureOntologyFromOutcome(undefined)).toBeNull();
  });

  it('merge + parse round-trip', () => {
    const record = {
      schema: FAILURE_ONTOLOGY_SCHEMA,
      primary_failure_type: 'NO_FUEL' as const,
      root_causes: ['winter_station_closed', 'fixed_speed_model_bias'] as const,
      observed_domain: 'fuel' as const,
      severity: 'high' as const,
      recovery_patterns: ['shorten_leg_next_town'],
    };

    const merged = mergeFailureOntologyIntoOutcome(baseOutcome, record);
    expect(merged.extensions?.[OPS_REALITY_OUTCOME_EXTENSION_KEY]).toEqual({
      ...record,
      schema: FAILURE_ONTOLOGY_SCHEMA,
    });

    const parsed = parseFailureOntologyFromOutcome(merged);
    expect(parsed?.primary_failure_type).toBe('NO_FUEL');
    expect(parsed?.root_causes).toContain('winter_station_closed');
  });

  it('coerceFailureOntologyPayload accepts API-shaped payload', () => {
    const r = coerceFailureOntologyPayload({
      primary_failure_type: 'NO_FUEL',
      observed_domain: 'fuel',
      severity: 'high',
      root_causes: ['winter_station_closed'],
    });
    expect(r?.primary_failure_type).toBe('NO_FUEL');
    expect(r?.schema).toBe(FAILURE_ONTOLOGY_SCHEMA);
  });

  it('coerceFailureOntologyPayload rejects invalid enums', () => {
    expect(
      coerceFailureOntologyPayload({
        primary_failure_type: 'NOT_A_REAL_TYPE',
        observed_domain: 'fuel',
        severity: 'high',
        root_causes: [],
      }),
    ).toBeNull();
  });
});
