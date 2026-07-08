import {
  applyProblemResolutions,
  findResolutionForProblem,
  isResolutionStale,
} from '../read/apply-problem-resolution.util';
import type { DecisionProblemDetail, DecisionProblemResolution } from '../types/decision-semantics.types';

describe('apply-problem-resolution', () => {
  const resolution: DecisionProblemResolution = {
    problemId: 'dp_gate_1',
    semanticKey: 'gate:REACHABILITY:f208',
    resolvedAt: '2026-06-30T10:00:00Z',
    resolvedByDecisionId: 'dec_1',
    resolvedTripVersion: 'rev-2',
    resolution: 'DECISION_EXECUTED',
  };

  const openProblem: DecisionProblemDetail = {
    id: 'dp_gate_1',
    tripId: 'trip1',
    type: 'INFEASIBILITY',
    title: '不可达',
    description: '封路',
    detectedBy: 'GATE',
    detectedAt: '2026-06-30T08:00:00Z',
    tripVersion: 'rev-1',
    affectedScope: [],
    status: 'OPEN',
    semanticKey: 'gate:REACHABILITY:f208',
    sourceRefs: [],
    assertionIds: [],
    assertions: [],
  };

  it('marks matching problem as RESOLVED', () => {
    const { items, staleSemanticKeys } = applyProblemResolutions([openProblem], [resolution]);
    expect(items[0].status).toBe('RESOLVED');
    expect(items[0].resolvedByDecisionId).toBe('dec_1');
    expect(staleSemanticKeys).toEqual([]);
  });

  it('ignores stale resolution when problem re-detected on newer trip version', () => {
    const redetected = {
      ...openProblem,
      tripVersion: 'rev-3',
      detectedAt: '2026-06-30T12:00:00Z',
    };
    const { items, staleSemanticKeys } = applyProblemResolutions([redetected], [resolution]);
    expect(items[0].status).toBe('OPEN');
    expect(staleSemanticKeys).toContain(resolution.semanticKey);
  });

  it('matches by semanticKey', () => {
    expect(findResolutionForProblem({ ...openProblem, id: 'other' }, [resolution])).toEqual(resolution);
    expect(isResolutionStale(openProblem, resolution)).toBe(false);
  });
});
