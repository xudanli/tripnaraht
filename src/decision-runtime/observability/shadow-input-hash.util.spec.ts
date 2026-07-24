import { hashCandidateSet, hashConstraintReports, stableHash } from './shadow-input-hash.util';
import type { DecisionCandidate } from '../candidates/contracts/decision-candidate';

describe('shadow-input-hash', () => {
  const candidates: DecisionCandidate[] = [
    {
      candidateId: 'b',
      label: 'B',
      source: 'LEGACY_TRIP_PLANNING',
      plan: { version: 'v1', createdAt: '', days: [{ day: 1, date: '2026-01-01', timeSlots: [] }] },
      utilityHint: 0.7,
      createdAt: '',
    },
    {
      candidateId: 'a',
      label: 'A',
      source: 'LEGACY_TRIP_PLANNING',
      plan: { version: 'v1', createdAt: '', days: [{ day: 1, date: '2026-01-01', timeSlots: [] }] },
      utilityHint: 0.9,
      createdAt: '',
    },
  ];

  it('hashes candidate set deterministically regardless of order', () => {
    const reversed = [...candidates].reverse();
    expect(hashCandidateSet(candidates)).toBe(hashCandidateSet(reversed));
  });

  it('changes hash when candidate set changes', () => {
    const other = [...candidates, { ...candidates[0], candidateId: 'c' }];
    expect(hashCandidateSet(candidates)).not.toBe(hashCandidateSet(other));
  });

  it('hashes constraint reports', () => {
    const reports = {
      a: {
        schemaId: 'tripnara.canonical_constraint_report@v1' as const,
        tripId: 't1',
        evaluatedAt: '',
        assertions: [],
        completeness: {
          roads: 'COMPLETE' as const,
          weather: 'COMPLETE' as const,
          hazards: 'COMPLETE' as const,
          ferries: 'COMPLETE' as const,
          openingHours: 'MISSING' as const,
        },
        overallStatus: 'FEASIBLE' as const,
        degraded: false,
        degradedReasons: [],
      },
    };
    expect(hashConstraintReports(reports)).toBe(hashConstraintReports(reports));
    expect(stableHash({ x: 1 })).toBe(stableHash({ x: 1 }));
  });
});
