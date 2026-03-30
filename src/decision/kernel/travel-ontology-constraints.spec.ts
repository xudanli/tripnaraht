import type { DecisionState } from './decision-state.types';
import {
  evaluateTravelOntologyConstraints,
  mergeOntologyViolationsIntoGateResult,
} from './travel-ontology-constraints';

describe('travel-ontology-constraints', () => {
  function baseDso(): DecisionState {
    return {
      userIntent: {},
      tripState: {},
      environmentState: {},
      systemState: { requestId: 'r1', version: 0 },
      requestId: 'r1',
    };
  }

  it('returns empty when no travelOntologyState nouns', () => {
    expect(evaluateTravelOntologyConstraints(baseDso())).toEqual([]);
  });

  it('flags budget overrun as SOFT BUDGET', () => {
    const dso: DecisionState = {
      ...baseDso(),
      userIntent: { budget: 1000, constraints: { budget: { total: 1000 } } as any },
      travelOntologyState: {
        nouns: {
          flights: [{ id: 'f1', price: 400 }],
          hotels: [{ id: 'h1', nightlyPrice: 200, checkIn: '2026-06-01', checkOut: '2026-06-05' }],
        },
      },
    };
    const v = evaluateTravelOntologyConstraints(dso);
    expect(v.length).toBeGreaterThanOrEqual(1);
    expect(v.some((x) => x.type === 'BUDGET' && x.severity === 'SOFT')).toBe(true);
  });

  it('flags overlapping flights', () => {
    const dso: DecisionState = {
      ...baseDso(),
      travelOntologyState: {
        nouns: {
          flights: [
            {
              id: 'a',
              departureTime: '2026-06-01T10:00:00Z',
              arrivalTime: '2026-06-01T14:00:00Z',
            },
            {
              id: 'b',
              departureTime: '2026-06-01T12:00:00Z',
              arrivalTime: '2026-06-01T16:00:00Z',
            },
          ],
        },
      },
    };
    const v = evaluateTravelOntologyConstraints(dso);
    expect(v.some((x) => x.constraint === 'travel_ontology_flight_overlap')).toBe(true);
  });

  it('mergeOntologyViolationsIntoGateResult upgrades ALLOW to ADJUST_REQUIRED on SOFT ontology', () => {
    const merged = mergeOntologyViolationsIntoGateResult(
      { feasible: true, violations: [] },
      { gate_result: 'ALLOW', violations: [], required_adjustments: [], confidence: 0.9 },
      [
        {
          type: 'BUDGET',
          severity: 'SOFT',
          detail: 'over',
          constraint: 'travel_ontology_budget',
        },
      ],
    );
    expect(merged.gateResult.gate_result).toBe('ADJUST_REQUIRED');
    expect(merged.constraints.feasible).toBe(true);
    expect(merged.constraints.violations).toHaveLength(1);
  });

  it('mergeOntologyViolationsIntoGateResult sets BLOCK on HARD ontology', () => {
    const merged = mergeOntologyViolationsIntoGateResult(
      { feasible: true, violations: [] },
      { gate_result: 'ALLOW', violations: [], required_adjustments: [], confidence: 0.9 },
      [{ type: 'SAFETY', severity: 'HARD', detail: 'x' }],
    );
    expect(merged.gateResult.gate_result).toBe('BLOCK');
    expect(merged.constraints.feasible).toBe(false);
  });
});
