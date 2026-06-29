import {
  enrichPlanningConflictsWithRelatedConstraintIds,
  inferRelatedConstraintIdsFromConflict,
} from './constraint-conflict-link.util';
import { TRIP_CONSTRAINT_OFFICIAL_IS_IDS } from '../types/trip-constraint.types';
import { officialConstraintIdForPoiAccessRule } from './iceland-poi-official-constraints.util';

describe('constraint-conflict-link.util', () => {
  it('inferRelatedConstraintIdsFromConflict: POI reservation issue', () => {
    const ids = inferRelatedConstraintIdsFromConflict({
      id: 'i1',
      source: 'feasibility',
      priority: 'must_handle',
      category: 'access_capacity',
      title: '蓝湖未预约',
      message: 'Blue Lagoon reservation required',
      issue: {
        id: 'i1',
        priority: 'must_handle',
        category: 'access_capacity',
        title: 'x',
        message: 'x',
        affectedDays: [1],
        severity: 'high',
        proofs: [{ ruleId: 'is.blue_lagoon.reservation_required', entity: 'poi', constraint: 'entity.mandatory_reservation', currentFact: '', evidenceSource: '', evidenceType: '', conclusion: '' }],
      },
    });
    expect(ids).toContain(
      officialConstraintIdForPoiAccessRule('is.blue_lagoon.reservation_required'),
    );
  });

  it('inferRelatedConstraintIdsFromConflict: F-road strategy + legacy transport', () => {
    const ids = inferRelatedConstraintIdsFromConflict({
      id: 'i2',
      source: 'feasibility',
      priority: 'must_handle',
      category: 'transport',
      title: 'F路车型',
      message: '2WD on F208',
    });
    expect(ids).toContain(TRIP_CONSTRAINT_OFFICIAL_IS_IDS.FROAD_2WD);
  });

  it('enrichPlanningConflictsWithRelatedConstraintIds attaches relatedConstraintIds', () => {
    const out = enrichPlanningConflictsWithRelatedConstraintIds([
      {
        id: 'i2',
        source: 'feasibility',
        priority: 'must_handle',
        category: 'transport',
        title: 'F路',
        message: 'VEHICLE_TYPE_INCOMPATIBLE',
      },
    ]);
    expect(out[0].relatedConstraintIds?.length).toBeGreaterThan(0);
  });
});
