import { classifyRouteAndRunRouteClass } from './route-and-run-route-class.util';
import { isCarRentalChatCardQuery } from '../chat/build-car-rental-chat-cards.util';
import { isActivityAdvanceBookingConsultQuery } from '../chat/build-activity-booking-chat-cards.util';
import { matchesAnyDataLookupProfile } from '../intent/intent-profile-registry';
import { buildCnG318HotspotBookingMeta } from '../../trips/readiness/utils/cn-g318-hotspot-booking.util';
import { loadCountryRagSeedChunks } from '../../trips/decision/evaluation/decision-closure-capture.util';
import { worldEventsFromRagChunks } from '../../world/rag-chunks-to-world-events.util';
import {
  CN_G318_E2E_GOLDENS,
  CN_G318_GOLDEN_SEEDS,
  toRouteAndRunGoldenEvalFixtures,
} from './cn-g318-golden-fixtures';

describe('CN G318 golden fixtures (护具)', () => {
  it('has expanded seed coverage (≥10)', () => {
    expect(CN_G318_GOLDEN_SEEDS.length).toBeGreaterThanOrEqual(10);
    expect(toRouteAndRunGoldenEvalFixtures()).toHaveLength(CN_G318_GOLDEN_SEEDS.length);
    expect(CN_G318_E2E_GOLDENS.length).toBe(CN_G318_GOLDEN_SEEDS.length);
  });

  describe.each(CN_G318_GOLDEN_SEEDS.map((s) => [s.id, s] as const))('%s', (_id, seed) => {
    it('classifies as QUICK_ANSWER', () => {
      const d = classifyRouteAndRunRouteClass({
        request_id: seed.id,
        user_id: 'eval-user',
        trip_id: '00000000-0000-4000-8000-000000000003',
        message: seed.message,
      });
      expect(d.routeClass).toBe('QUICK_ANSWER');
      expect(d.orchestrationDepth).toBe('LIGHT_LOOKUP');
    });
  });

  it('booking intents hit data-lookup / card predicates', () => {
    expect(
      matchesAnyDataLookupProfile(
        '帮我搜索康定木格措景区8月21日的门票预订信息和价格',
      ),
    ).toBe(true);
    expect(
      isActivityAdvanceBookingConsultQuery(
        '帮我搜索康定木格措景区8月21日的门票预订信息和价格',
      ),
    ).toBe(true);
    expect(isCarRentalChatCardQuery('我想在康定租一辆越野车')).toBe(true);
    expect(matchesAnyDataLookupProfile('康定8月21日住哪家酒店')).toBe(true);
  });

  it('Mugecuo messages attach hotspot booking meta', () => {
    expect(
      buildCnG318HotspotBookingMeta(
        '帮我搜索康定木格措景区8月21日的门票预订信息和价格',
      )?.hotspot_id,
    ).toBe('cn.poi.mugecuo');
    expect(buildCnG318HotspotBookingMeta('木格措需要提前订票吗')?.name_cn).toBe('木格措');
  });

  it('CN RAG seed materializes ROAD + WEATHER for rainy window', () => {
    const chunks = loadCountryRagSeedChunks('CN');
    expect(chunks.length).toBeGreaterThanOrEqual(7);
    const events = worldEventsFromRagChunks(chunks, { tripDates: ['2026-07-15'] });
    expect(
      events.some(
        (e) => e.kind === 'ROAD' && (e as { roadId: string }).roadId === 'CN-G318-WEST-SICHUAN',
      ),
    ).toBe(true);
    expect(events.some((e) => e.kind === 'WEATHER')).toBe(true);
  });
});
