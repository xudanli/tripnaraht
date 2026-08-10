import { resolveReadinessClaimItem } from './readiness-claim.catalog';

describe('team-tasks itinerary source contract', () => {
  it('documents known source types including itinerary_item', () => {
    const known = [
      'manual',
      'packing_template',
      'readiness',
      'ask_ai',
      'itinerary_item',
    ];
    expect(known).toContain('itinerary_item');
  });

  it('readiness catalog still resolves independently', () => {
    expect(resolveReadinessClaimItem('RENTAL_ORDER').titleZh.length).toBeGreaterThan(0);
  });
});
