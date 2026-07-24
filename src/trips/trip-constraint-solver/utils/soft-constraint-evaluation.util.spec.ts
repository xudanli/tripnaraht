import { resolveSoftConstraintTradeoffs } from './soft-constraint-evaluation.util';
import type { TripConstraint } from '../types/trip-constraint.types';

function softTpl(
  templateId: string,
  priority: number,
  name: string,
): TripConstraint {
  const id = `c_tpl_${templateId}`;
  return {
    id,
    tripId: 't1',
    name,
    category: 'ACTIVITY',
    type: 'SOFT',
    status: 'ACTIVE',
    scope: { type: 'TRIP' },
    operator: 'CUSTOM',
    value: { templateId, intensity: priority >= 7 ? 85 : priority >= 4 ? 50 : 25 },
    priority,
    allowRelaxation: true,
    locked: false,
    source: { type: 'USER', templateId },
    visibility: 'TEAM',
    createdBy: 'u1',
    createdAt: '',
    updatedAt: '',
  };
}

describe('soft-constraint-evaluation.util', () => {
  it('sacrifices lower priority soft constraint in hotel vs sunset trade-off', () => {
    const result = resolveSoftConstraintTradeoffs([
      softTpl('minimize_hotel_changes', 8, '少换酒店'),
      softTpl('sunset_photography', 3, '日落摄影'),
    ]);
    expect(result.sacrificedIds).toContain('c_tpl_sunset_photography');
    expect(result.satisfiedIds).toContain('c_tpl_minimize_hotel_changes');
    expect(result.advisories[0]?.priority).toBe('suggest_adjust');
    expect(result.advisories[0]?.relatedConstraintIds).toEqual(['c_tpl_sunset_photography']);
  });
});
