import { applyClarificationAndTripToSubSignals } from './axiom-clarification-signals.util';
import { buildAxiomMatchContext } from './build-axiom-match-context.util';
import { matchAxioms } from './axiom-matchers';
import { analyzeRouteAndRunIntent } from '../utils/route-and-run-intent-analyzer.util';
import type { TripPlanRequest } from '../interfaces/trip-plan.interface';

describe('axiom-clarification-signals', () => {
  it('LOCK_MIDNIGHT_SUN_WHALE_SLOT 回灌 peak + whale 并标记 CLARIFICATION', () => {
    const base = analyzeRouteAndRunIntent('北部观鲸安排');
    const trip = {
      message: '北部观鲸安排',
      guardian_debate_trip_context: {
        scheduling_constraints: {
          whale_watching_slot: { start_local: '20:30', end_local: '23:30' },
          midnight_sun_slot_locked: true,
        },
        user_intent_anchors: { whale_watching_husavik: true, peak_season_crowd_avoidance: true },
      },
    } as TripPlanRequest;

    const { analysis, subSignalSources } = applyClarificationAndTripToSubSignals({
      analysis: base,
      trip,
      clarificationAnswers: [
        { questionId: 'peak_season_midnight_sun_whale_v1', value: 'LOCK_MIDNIGHT_SUN_WHALE_SLOT' },
      ],
    });

    expect(analysis.sub_signals.peak_season_crowd_avoidance).toBe(true);
    expect(subSignalSources.peak_season_crowd_avoidance).toBe('CLARIFICATION');

    const eta = matchAxioms(
      buildAxiomMatchContext({
        trip,
        routeAndRunIntent: analysis,
        clarificationAnswers: [
          { questionId: 'peak_season_midnight_sun_whale_v1', value: 'LOCK_MIDNIGHT_SUN_WHALE_SLOT' },
        ],
      }),
    ).find((m) => m.axiom_id === 'ETA_INFEASIBLE');
    expect(eta?.evidence.match_source).toBe('CLARIFICATION');
    expect(eta?.evidence.metric_details).toEqual(
      expect.objectContaining({ actual: 1, limit: 0, unit: 'bool' }),
    );
  });

  it('升级 4WD 后清除 froad_2wd_compliance', () => {
    const msg =
      '外头写着F208公路开了，我们打算6月18号租一辆普通的丰田 Yaris，走 F208 北线横穿内陆高地去兰曼纳劳卡。';
    const trip = {
      message: msg,
      constraints: { vehicle_type: '4WD' },
    } as TripPlanRequest;
    const ctx = buildAxiomMatchContext({
      message: msg,
      trip,
      clarificationAnswers: [
        { questionId: 'froad_2wd_compliance_v1', value: 'UPGRADE_VEHICLE_TO_4WD' },
      ],
    });
    expect(ctx.routeAndRun?.sub_signals.froad_2wd_compliance).toBe(false);
    expect(matchAxioms(ctx).some((m) => m.axiom_id === 'TERRAIN_F_ROAD_UNFIT')).toBe(false);
  });
});
