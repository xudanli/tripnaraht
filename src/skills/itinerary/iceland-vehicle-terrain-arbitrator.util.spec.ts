import {
  buildVirtualCarRentalRowsFromIntent,
  collectIcelandVehicleTerrainArbitrationIssues,
  inferCarRentalDriveFromResearchRows,
  itineraryImpliesFRoadOrHighland,
  safetravelWindStormSignal,
  userQueryImpliesVehiclePickup,
} from './iceland-vehicle-terrain-arbitrator.util';
import type { Itinerary } from '../../agent/interfaces/trip-plan.interface';
import icelandV1 from '../../assets/strategy/iceland-v1.json';
import type { IcelandStrategyDocumentV1 } from '../../agent/strategy/world-strategy.types';

function baseItinerary(overrides: Partial<Itinerary> = {}): Itinerary {
  return {
    request_id: 't1',
    days: [
      {
        date: '2026-07-10',
        items: [
          {
            id: 'i1',
            type: 'POI',
            notes: 'Drive F208 highland segment',
            evidence_refs: [],
          } as any,
        ],
      },
    ],
    ...overrides,
  } as Itinerary;
}

describe('iceland-vehicle-terrain-arbitrator', () => {
  it('itineraryImpliesFRoadOrHighland detects F-road token', () => {
    expect(itineraryImpliesFRoadOrHighland(baseItinerary())).toBe(true);
  });

  it('inferCarRentalDriveFromResearchRows marks likely 2WD from economy rows', () => {
    expect(inferCarRentalDriveFromResearchRows([{ vehicle_class: 'Economy', name: 'VW Up' }])).toBe('likely_2wd_only');
  });

  it('collectIssues: F-road + likely 2WD → CRITICAL', () => {
    const issues = collectIcelandVehicleTerrainArbitrationIssues({
      itinerary: baseItinerary(),
      research_data: {
        country_code: 'IS',
        car_rentals: [{ title: 'Economy 2WD', vehicle_class: 'Economy' }],
      },
    });
    const crit = issues.find((i) => i.severity === 'CRITICAL');
    expect(crit).toBeDefined();
    expect(crit?.violation?.anchor.ruleId).toContain('froad_2wd');
  });

  it('collectIssues: F-road + 2WD + world_strategy → refIds include strat:STRAT_ICE_002', () => {
    const issues = collectIcelandVehicleTerrainArbitrationIssues({
      itinerary: baseItinerary(),
      research_data: {
        country_code: 'IS',
        car_rentals: [{ title: 'Economy 2WD', vehicle_class: 'Economy' }],
      },
      world_strategy: icelandV1 as IcelandStrategyDocumentV1,
    });
    const crit = issues.find((i) => i.severity === 'CRITICAL');
    expect(crit?.violation?.evidence?.refIds?.some((r) => r === 'strat:STRAT_ICE_002')).toBe(true);
  });

  it('collectIssues: July + F-road + 2WD + world_strategy → STRAT_ICE_002 only, not STRAT_ICE_001 (winter F-road rule out of season)', () => {
    const summerIt = baseItinerary({
      days: [{ date: '2026-07-15', items: baseItinerary().days![0].items }],
    });
    const issues = collectIcelandVehicleTerrainArbitrationIssues({
      itinerary: summerIt,
      research_data: {
        country_code: 'IS',
        car_rentals: [{ title: 'Economy 2WD', vehicle_class: 'Economy' }],
      },
      world_strategy: icelandV1 as IcelandStrategyDocumentV1,
    });
    const crit = issues.find((i) => i.severity === 'CRITICAL');
    expect(crit?.violation?.evidence?.refIds?.some((r) => r === 'strat:STRAT_ICE_002')).toBe(true);
    expect(crit?.violation?.evidence?.refIds?.some((r) => r === 'strat:STRAT_ICE_001')).toBe(false);
  });

  it('collectIssues: winter window + Iceland + rental rows → studded WARNING', () => {
    const winterIt = baseItinerary({
      days: [{ date: '2026-02-01', items: baseItinerary().days![0].items }],
    });
    const issues = collectIcelandVehicleTerrainArbitrationIssues({
      itinerary: winterIt,
      research_data: { country_code: 'IS', car_rentals: [{ name: 'SUV AWD' }] },
    });
    expect(issues.some((i) => i.violation?.anchor.ruleId?.includes('studded_tires'))).toBe(true);
  });

  it('collectIssues: 无 car_rentals 但话术含雅力士 + F-road → CRITICAL（意图虚拟行）', () => {
    const issues = collectIcelandVehicleTerrainArbitrationIssues({
      itinerary: baseItinerary(),
      research_data: { country_code: 'IS' },
      user_query: '我们租丰田雅力士开 F208',
    });
    const crit = issues.find((i) => i.severity === 'CRITICAL');
    expect(crit?.violation?.anchor.ruleId).toContain('froad_2wd_intent');
    expect(buildVirtualCarRentalRowsFromIntent('雅力士', undefined).length).toBeGreaterThan(0);
  });

  it('collectIssues: constraints 2WD hint + F-road → CRITICAL（意图虚拟行）', () => {
    const issues = collectIcelandVehicleTerrainArbitrationIssues({
      itinerary: baseItinerary(),
      research_data: { country_code: 'IS' },
      intent_hints: { constraints_vehicle_type: '2WD' },
    });
    expect(issues.some((i) => i.violation?.anchor.ruleId?.includes('froad_2wd_intent'))).toBe(true);
  });

  it('collectIssues: 画像「冬季冰岛2WD」 alone + F-road → 不升 CRITICAL（无本轮明示）', () => {
    const pref = '冬季冰岛2WD，避免F-road；每日车程不超过4小时';
    expect(
      buildVirtualCarRentalRowsFromIntent('确认', {
        preference_text: pref,
        transport_preferences: pref,
      }),
    ).toEqual([]);
    const issues = collectIcelandVehicleTerrainArbitrationIssues({
      itinerary: baseItinerary(),
      research_data: { country_code: 'IS' },
      user_query: '确认\n\n[日程] Day4 Day 4 · 冰川徒步',
      intent_hints: { preference_text: pref, transport_preferences: pref },
    });
    expect(issues.some((i) => i.severity === 'CRITICAL')).toBe(false);
    expect(issues.some((i) => i.violation?.anchor.ruleId?.includes('froad_no_rental_rows'))).toBe(true);
  });

  it('collectIssues: FITNESS_PROFILE 注入不得伪造 2WD CRITICAL', () => {
    const q =
      '我可以早起，然后看日出，帮我生成草案吧\n\n[SYSTEM_MESSAGE][FITNESS_PROFILE]\nmoderate\n\n[日程] Day3';
    expect(buildVirtualCarRentalRowsFromIntent(q, undefined)).toEqual([]);
    const issues = collectIcelandVehicleTerrainArbitrationIssues({
      itinerary: baseItinerary(),
      research_data: { country_code: 'IS' },
      user_query: q,
    });
    expect(issues.some((i) => i.severity === 'CRITICAL')).toBe(false);
  });

  it('collectIssues: constraints 4WD 覆盖画像 2WD 文案 → 无 CRITICAL', () => {
    const pref = '冬季冰岛2WD，避免F-road';
    const issues = collectIcelandVehicleTerrainArbitrationIssues({
      itinerary: baseItinerary(),
      research_data: { country_code: 'IS' },
      user_query: '8月20号前往东住霍芬',
      intent_hints: {
        constraints_vehicle_type: '4WD',
        preference_text: pref,
        transport_preferences: pref,
      },
    });
    expect(issues.some((i) => i.severity === 'CRITICAL')).toBe(false);
    expect(buildVirtualCarRentalRowsFromIntent('去霍芬', { constraints_vehicle_type: '4WD', preference_text: pref })[0]?.wheelIntent).toBe(
      'FOUR',
    );
  });

  it('userQueryImpliesVehiclePickup + wind signal → wind_pickup WARNING', () => {
    expect(userQueryImpliesVehiclePickup('明天去车行提车')).toBe(true);
    expect(
      safetravelWindStormSignal({
        safetravel_alerts: [{ title: '橙色风暴预警', severity: 'high', summary: 'strong gale' }],
      }),
    ).toBe(true);
    const issues = collectIcelandVehicleTerrainArbitrationIssues({
      itinerary: baseItinerary({
        days: [{ date: '2026-07-10', items: [{ id: 'x', type: 'POI', evidence_refs: [] } as any] }],
      }),
      research_data: {
        country_code: 'IS',
        safetravel_alerts: [{ title: '大风橙色预警', severity: 'high' }],
      },
      user_query: '下午去车行提车',
    });
    expect(issues.some((i) => i.violation?.anchor.ruleId?.includes('wind_pickup'))).toBe(true);
  });
});
