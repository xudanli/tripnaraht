import {
  classifyDrivingRagIntentPhase,
  expandedRentalTransactionRagQuery,
} from './driving-rag-intent-phase.util';

describe('classifyDrivingRagIntentPhase', () => {
  it('treats bare 租车 as rental_transaction', () => {
    expect(classifyDrivingRagIntentPhase('租车')).toBe('rental_transaction');
  });

  it('treats winter driving danger as driving_safety', () => {
    expect(classifyDrivingRagIntentPhase('冰岛冬天开车危险吗')).toBe('driving_safety');
  });

  it('treats ring road self-drive planning as road_trip_planning', () => {
    expect(classifyDrivingRagIntentPhase('环岛自驾怎么安排')).toBe('road_trip_planning');
  });
});

describe('expandedRentalTransactionRagQuery', () => {
  it('appends transactional hints', () => {
    const q = expandedRentalTransactionRagQuery('租车');
    expect(q).toContain('保险');
    expect(q).toContain('提车');
  });
});
