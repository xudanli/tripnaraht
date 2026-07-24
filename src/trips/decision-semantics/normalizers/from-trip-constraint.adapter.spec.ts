import type { TripConstraint } from '../../trip-constraint-solver/types/trip-constraint.types';
import {
  adaptTripConstraintToProblem,
  buildAssertionFromTripConstraint,
  mapTripConstraintCategoryToDomain,
  tripConstraintProblemDuplicatesExisting,
  tripConstraintSemanticKey,
} from './from-trip-constraint.adapter';

function baseConstraint(overrides: Partial<TripConstraint> = {}): TripConstraint {
  return {
    id: 'c_max_daily_drive',
    tripId: 'trip1',
    name: '每日最大驾驶时长',
    description: '单日驾驶不得超过 6 小时',
    category: 'TRANSPORT',
    type: 'HARD',
    status: 'CONFLICTED',
    scope: { type: 'TRIP' },
    operator: 'LTE',
    value: 6,
    unit: 'hour',
    allowRelaxation: false,
    locked: false,
    source: { type: 'USER' },
    visibility: 'TEAM',
    createdBy: 'u1',
    createdAt: '2026-06-01T00:00:00Z',
    updatedAt: '2026-06-30T00:00:00Z',
    hasConflict: true,
    ...overrides,
  };
}

describe('from-trip-constraint.adapter', () => {
  it('maps transport category to ROUTE domain', () => {
    expect(mapTripConstraintCategoryToDomain('TRANSPORT')).toBe('ROUTE');
    expect(mapTripConstraintCategoryToDomain('BUDGET')).toBe('BUDGET');
  });

  it('builds TRIP_CONSTRAINT assertion with stable id', () => {
    const assertion = buildAssertionFromTripConstraint(baseConstraint());
    expect(assertion.sourceSystem).toBe('TRIP_CONSTRAINT');
    expect(assertion.sourceRefId).toBe('c_max_daily_drive');
    expect(assertion.id).toBe('ca_tc_c_max_daily_drive');
  });

  it('adaptTripConstraintToProblem uses related conflict title', () => {
    const { problem } = adaptTripConstraintToProblem(
      baseConstraint(),
      'trip1',
      'rev1',
      '2026-06-30T08:00:00Z',
      {
        id: 'conf1',
        source: 'feasibility',
        priority: 'must_handle',
        category: 'transport',
        title: '驾驶时长超限',
        message: 'Day 2 驾驶 7.5h 超过上限',
        affectedDays: [2],
        semanticKey: 'feas:drive:day2',
        relatedConstraintIds: ['c_max_daily_drive'],
      },
    );
    expect(problem.detectedBy).toBe('TRIP_CONSTRAINT');
    expect(problem.title).toBe('驾驶时长超限');
    expect(problem.semanticKey).toBe('tc:c_max_daily_drive:feas:drive:day2');
    expect(problem.sourceRefs[0].system).toBe('TRIP_CONSTRAINT');
  });

  it('tripConstraintSemanticKey falls back to constraint id', () => {
    expect(tripConstraintSemanticKey(baseConstraint())).toBe('tc:c_max_daily_drive');
  });

  it('tripConstraintProblemDuplicatesExisting detects same constraint ref', () => {
    const { problem } = adaptTripConstraintToProblem(
      baseConstraint(),
      'trip1',
      '1',
      '2026-06-30T08:00:00Z',
    );
    const merged = new Map([
      [
        'existing',
        {
          sourceRefs: [{ system: 'TRIP_CONSTRAINT' as const, refId: 'c_max_daily_drive' }],
          description: 'other',
        },
      ],
    ]);
    expect(tripConstraintProblemDuplicatesExisting(problem, merged, [])).toBe(true);
  });
});
