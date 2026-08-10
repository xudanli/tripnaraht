import { buildDecisionStateShadow } from './build-decision-state-shadow.util';
import { classifyTransportRouteDecision } from './classify-transport-route-decision.util';
import { mapTripDayWorldConflictToMds } from './map-trip-day-world-conflict.util';
import { resolveDecisionTakeover } from './activity-decision-takeover.util';

describe('Transport / Route Decision State + day_conflict map', () => {
  it('map：activity_on_other_day → HARD', () => {
    const m = mapTripDayWorldConflictToMds('activity_on_other_day', {
      matchedOtherDays: [5],
    });
    expect(m.status).toBe('HARD');
    expect(m.reasons.join(' ')).toMatch(/activity_on_other_day|matched_days=5/);
  });

  it('map：empty_day → SOFT；none → NONE', () => {
    expect(mapTripDayWorldConflictToMds('empty_day').status).toBe('SOFT');
    expect(mapTripDayWorldConflictToMds('none').status).toBe('NONE');
  });

  it('分类：2WD + F路 → VEHICLE_FIT', () => {
    expect(classifyTransportRouteDecision('2WD 能上 F-road 吗？').decisionClass).toBe(
      'TRANSPORT.VEHICLE_FIT',
    );
  });

  it('分类：租车保险 → RENTAL_GUIDANCE', () => {
    expect(classifyTransportRouteDecision('冰岛租车要买碎石险吗').decisionClass).toBe(
      'TRANSPORT.RENTAL_GUIDANCE',
    );
  });

  it('分类：优化第六天路线 → DAY_ORDER_OPTIMIZE', () => {
    expect(
      classifyTransportRouteDecision('优化第六天路线顺序', 'trip-1').decisionClass,
    ).toBe('ROUTE.DAY_ORDER_OPTIMIZE');
  });

  it('VEHICLE_FIT 齐全 → READY；忽略 day_pace', () => {
    const shadow = buildDecisionStateShadow({
      message: '两驱能上高地 F 路吗？',
      transportHints: { tripId: 'trip-1' },
      legacy: { wouldAskUser: true, blockKeys: ['day_pace'] },
    });
    expect(shadow.classified.decisionClass).toBe('TRANSPORT.VEHICLE_FIT');
    expect(shadow.readiness?.nextAction).toBe('ANSWER');
    expect(resolveDecisionTakeover(shadow).kind).toBe('OBSERVE_ONLY_CONTINUE');
    expect(shadow.legacyCompare.divergenceCodes).toContain(
      'LEGACY_BLOCKED_ON_IGNORED_KEY',
    );
  });

  it('ROUTE 有 trip+day → READY；无 trip → ASK', () => {
    const ready = buildDecisionStateShadow({
      message: '优化第6天路线',
      transportHints: { tripId: 'trip-1', focusDayIndex: 6 },
    });
    expect(ready.classified.decisionClass).toBe('ROUTE.DAY_ORDER_OPTIMIZE');
    expect(ready.readiness?.nextAction).toBe('ANSWER');

    const ask = buildDecisionStateShadow({
      message: '优化第6天路线',
    });
    expect(ask.readiness?.askUserKeys).toContain('trip_binding');
    expect(resolveDecisionTakeover(ask).kind).toBe('ASK_FROM_READINESS');
  });

  it('Activity day_conflict HARD 进入投影', () => {
    const shadow = buildDecisionStateShadow({
      message: '预订第4天的冰川徒步活动',
      activityHints: {
        focusDayIndex: 4,
        dayConflict: {
          status: 'HARD',
          reasons: ['activity_on_other_day'],
        },
        activitySearchMeta: { mode: 'catalog_only', probed: 0 },
        teamFitness: { floor: 'HIGH', missingCount: 0 },
      },
    });
    const conflict = shadow.projection?.keys.find((k) => k.key === 'day_conflict');
    expect(conflict?.presence).toBe('PRESENT');
    expect((conflict?.value as { status: string }).status).toBe('HARD');
  });
});
