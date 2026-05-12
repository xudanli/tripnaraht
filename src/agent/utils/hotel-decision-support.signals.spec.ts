import {
  extractHotelDecisionLayers,
  shouldInvokeStewardNarrator,
  inferPersonaDnaZh,
} from './hotel-decision-support.signals';

describe('hotel-decision-support.signals', () => {
  const baseCtx = {
    party_total: 5,
    cost_sensitivity: 0.7,
    effort_sensitivity: 0.5,
    has_children: true,
    has_elderly: false,
  };

  it('extractHotelDecisionLayers flags high_rating_far_anchor', () => {
    const { facts, signals, conflicts } = extractHotelDecisionLayers(
      {
        id: 'a1',
        source: 'airbnb',
        name: 'Test',
        rating: 4.9,
        distance_to_anchor_km: 8,
        anchor_poi_name_zh: '码头',
        priceLabel: '$120 per night',
      },
      {
        structuredContent: { primaryLine: 'Entire studio · 2 guests' },
        personCapacity: 2,
      },
      baseCtx,
    );
    expect(facts.listing_id).toBe('a1');
    expect(signals.distance_status).toBe('far');
    expect(conflicts).toContain('high_rating_far_anchor');
    expect(shouldInvokeStewardNarrator(conflicts, signals, facts)).toBe(true);
  });

  it('shouldInvokeStewardNarrator is true for polar rating even without conflict codes', () => {
    const { conflicts, signals, facts } = extractHotelDecisionLayers(
      {
        id: 'c1',
        source: 'hotel',
        name: 'Polar',
        rating: 4.92,
        distance_to_anchor_km: 2,
        anchor_poi_name_zh: '锚点',
        priceLabel: '$99',
      },
      undefined,
      { party_total: 2, cost_sensitivity: 0.5 },
    );
    expect(conflicts.length).toBe(0);
    expect(shouldInvokeStewardNarrator(conflicts, signals, facts)).toBe(true);
  });

  it('shouldInvokeStewardNarrator is false for bland card without conflicts', () => {
    const { conflicts, signals } = extractHotelDecisionLayers(
      {
        id: 'b1',
        source: 'hotel',
        name: 'Plain',
        rating: 4.4,
        distance_to_anchor_km: 2,
      },
      undefined,
      { ...baseCtx, party_total: 2, cost_sensitivity: 0.5 },
    );
    expect(conflicts.length).toBe(0);
    expect(shouldInvokeStewardNarrator(conflicts, signals, undefined)).toBe(false);
  });

  it('inferPersonaDnaZh includes standing hotel digest when set', () => {
    const zh = inferPersonaDnaZh({
      cost_sensitivity: 0.5,
      effort_sensitivity: 0.5,
      standing_hotel_style_digest_zh: '住宿口味：极简',
    });
    expect(zh).toContain('极简');
  });

  it('inferPersonaDnaZh summarizes prefs and party', () => {
    const zh = inferPersonaDnaZh(baseCtx);
    expect(zh).toContain('偏节俭');
    expect(zh).toContain('带娃');
  });

  it('extractHotelDecisionLayers flags standing_preference_avoid_match', () => {
    const { conflicts } = extractHotelDecisionLayers(
      {
        id: 'x1',
        source: 'hotel',
        name: 'Hilton Reykjavik',
        rating: 4.5,
        distance_to_anchor_km: 2,
      },
      undefined,
      {
        ...baseCtx,
        party_total: 2,
        standing_hotel_avoid_terms_lower: ['hilton'],
      },
    );
    expect(conflicts).toContain('standing_preference_avoid_match');
  });
});
