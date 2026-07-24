import { buildGateRepairOptions, inferGateRepairType } from '../repair/gate-repair-recipes.util';
import type { ConstraintAssertion, DecisionProblemDetail } from '../types/decision-semantics.types';

function gateDetail(type: string): DecisionProblemDetail {
  return {
    id: 'dp_gate',
    tripId: 'trip1',
    type: 'INFEASIBILITY',
    title: 'Gate issue',
    description: `${type} violation`,
    detectedBy: 'GATE',
    detectedAt: '2026-06-30T08:00:00Z',
    tripVersion: '1',
    affectedScope: [],
    status: 'OPEN',
    semanticKey: `gate:${type}:demo`,
    sourceRefs: [{ system: 'GATE', refId: `${type}:demo` }],
    assertionIds: ['ca1'],
    assertions: [],
  };
}

function gateAssertion(type: string): ConstraintAssertion {
  return {
    id: 'ca1',
    sourceSystem: 'GATE',
    sourceRefId: `${type}:demo`,
    nature: 'HARD_CONSTRAINT',
    domain: 'ROUTE',
    enforcement: 'BLOCK',
    overridable: false,
    condition: type,
    conclusion: 'blocked',
    proofs: [],
  };
}

describe('gate-repair-recipes', () => {
  it('infers gate types from semanticKey', () => {
    expect(inferGateRepairType(gateDetail('REACHABILITY'), gateAssertion('REACHABILITY'))).toBe(
      'REACHABILITY',
    );
    expect(inferGateRepairType(gateDetail('DEM'), gateAssertion('DEM'))).toBe('DEM');
  });

  it('returns 3 REACHABILITY repair options', () => {
    const options = buildGateRepairOptions(gateDetail('REACHABILITY'), gateAssertion('REACHABILITY'));
    expect(options).toHaveLength(3);
    expect(options.every((o) => o.source === 'RULE_ENGINE')).toBe(true);
    expect(options.map((o) => o.id)).toEqual([
      'gate_reach_alt_route',
      'gate_reach_split_leg',
      'gate_reach_change_mode',
    ]);
  });

  it('returns DATA_MISSING options including revalidate', () => {
    const options = buildGateRepairOptions(gateDetail('DATA_MISSING'), gateAssertion('DATA_MISSING'));
    expect(options.some((o) => o.id === 'gate_data_revalidate')).toBe(true);
  });

  it('returns empty for unknown gate type', () => {
    expect(buildGateRepairOptions(gateDetail('CUSTOM'), gateAssertion('CUSTOM'))).toEqual([]);
  });
});
