import type { Itinerary } from '../interfaces/trip-plan.interface';
import { collectItineraryPoiAccessVerifyIssues } from './itinerary-poi-access-verify.util';
import { ICELAND_A_TIER_ACCESS_RULES } from '../../poi-access-capacity/fixtures/is-a-tier.rules';

function buildRulesMap() {
  const map = new Map<string, typeof ICELAND_A_TIER_ACCESS_RULES>();
  for (const rule of ICELAND_A_TIER_ACCESS_RULES) {
    const list = map.get(rule.poiId) ?? [];
    list.push(rule);
    map.set(rule.poiId, list);
  }
  return map;
}

describe('collectItineraryPoiAccessVerifyIssues', () => {
  const rulesByPoiSlug = buildRulesMap();

  it('行程含 Blue Lagoon 无预约 → POI_ACCESS_BLOCKED', () => {
    const itinerary: Itinerary = {
      request_id: 'test',
      days: [
        {
          date: '2026-08-01',
          items: [
            {
              id: 'item-1',
              type: 'POI',
              start_window: '14:00',
              end_window: '16:00',
              location_ref: { name: 'Blue Lagoon', place_id: '123' },
            },
          ],
        },
      ],
    };

    const issues = collectItineraryPoiAccessVerifyIssues({
      itinerary,
      rulesByPoiSlug,
      staleRuleDays: 365,
    });

    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe('POI_ACCESS_BLOCKED');
    expect(issues[0].severity).toBe('ERROR');
    expect(issues[0].violation?.anchor.constraintId).toBe('entity.mandatory_reservation');
  });

  it('非 A 级 POI 名称不匹配 → 无 issue', () => {
    const itinerary: Itinerary = {
      request_id: 'test',
      days: [
        {
          date: '2026-08-01',
          items: [
            {
              id: 'item-1',
              type: 'POI',
              start_window: '10:00',
              end_window: '11:00',
              location_ref: { name: 'Gullfoss', place_id: '456' },
            },
          ],
        },
      ],
    };

    const issues = collectItineraryPoiAccessVerifyIssues({
      itinerary,
      rulesByPoiSlug,
    });
    expect(issues).toHaveLength(0);
  });
});
