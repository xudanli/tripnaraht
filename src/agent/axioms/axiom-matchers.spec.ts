import { buildAxiomMatchContext } from './build-axiom-match-context.util';
import { matchAxioms, pickDominantAxiom } from './axiom-matchers';
import { analyzeRouteAndRunIntent } from '../utils/route-and-run-intent-analyzer.util';
import type { TripPlanRequest } from '../interfaces/trip-plan.interface';

/** Yaris 话术无显式「2WD」：意图层靠 lean 检测，启发式公理层原先会漏。 */
const YARIS_F208_NO_EXPLICIT_2WD =
  '外头写着F208公路开了，我们打算6月18号租一辆普通的丰田 Yaris，走 F208 北线横穿内陆高地去兰曼纳劳卡。';

describe('axiom-matchers — terrain intent signal channel', () => {
  it('matches TERRAIN_F_ROAD_UNFIT via froad_2wd_compliance when heuristic alone would miss', () => {
    const routeAndRun = analyzeRouteAndRunIntent(YARIS_F208_NO_EXPLICIT_2WD, {
      trip: { message: YARIS_F208_NO_EXPLICIT_2WD } as TripPlanRequest,
    });
    expect(routeAndRun.sub_signals.froad_2wd_compliance).toBe(true);

    const heuristicOnly = matchAxioms({ message: YARIS_F208_NO_EXPLICIT_2WD });
    expect(heuristicOnly.some((m) => m.axiom_id === 'TERRAIN_F_ROAD_UNFIT')).toBe(false);

    const ctx = buildAxiomMatchContext({
      message: YARIS_F208_NO_EXPLICIT_2WD,
      routeAndRunIntent: routeAndRun,
    });
    const matches = matchAxioms(ctx);
    const terrain = matches.find((m) => m.axiom_id === 'TERRAIN_F_ROAD_UNFIT');
    expect(terrain).toBeDefined();
    expect(terrain?.evidence.match_source).toBe('INTENT_SIGNAL');
    expect(terrain?.evidence.proof_payload?.primary_froad).toBe('F208');
    expect(pickDominantAxiom(matches)?.axiom_id).toBe('TERRAIN_F_ROAD_UNFIT');
  });

  it('buildAxiomMatchContext runs route-and-run when intent not injected', () => {
    const ctx = buildAxiomMatchContext({
      message: YARIS_F208_NO_EXPLICIT_2WD,
      trip: { message: YARIS_F208_NO_EXPLICIT_2WD } as TripPlanRequest,
    });
    expect(ctx.routeAndRun?.sub_signals.froad_2wd_compliance).toBe(true);
    expect(matchAxioms(ctx).some((m) => m.axiom_id === 'TERRAIN_F_ROAD_UNFIT')).toBe(true);
  });

  it('heuristic fallback still matches explicit 2WD + F-road keywords', () => {
    const msg = 'We will drive F208 f-road in 2WD';
    const matches = matchAxioms({ message: msg, constraints: { vehicle_type: '2WD' } });
    const terrain = matches.find((m) => m.axiom_id === 'TERRAIN_F_ROAD_UNFIT');
    expect(terrain?.evidence.match_source).toBe('HEURISTIC');
  });
});

/** 极昼马拉松 SKU，无显式「N 小时驾驶」字面 → 仅意图通道命中。 */
const MARATHON_MSG = '想利用极昼，不间断连续自驾环岛';

const PEAK_SEASON_MSG =
  '6月25号下午我们到北部的胡萨维克，想安排一场观鲸，晚上住在阿克雷里，希望避开白天的旅游大巴人潮。';

describe('axiom-matchers — fatigue & ETA intent signal channel', () => {
  it('FATIGUE_OVERLOAD via marathon_deferred when hour heuristic misses', () => {
    const routeAndRun = analyzeRouteAndRunIntent(MARATHON_MSG);
    expect(routeAndRun.sub_signals.marathon_deferred).toBe(true);
    expect(matchAxioms({ message: MARATHON_MSG }).some((m) => m.axiom_id === 'FATIGUE_OVERLOAD')).toBe(false);

    const fatigue = matchAxioms(
      buildAxiomMatchContext({ message: MARATHON_MSG, routeAndRunIntent: routeAndRun }),
    ).find((m) => m.axiom_id === 'FATIGUE_OVERLOAD');
    expect(fatigue?.evidence.match_source).toBe('INTENT_SIGNAL');
    expect(fatigue?.evidence.proof_payload?.planned_duration_minutes).toBe(12 * 60);
  });

  it('ETA_INFEASIBLE via peak_season_crowd_avoidance without 赶不上 keywords', () => {
    const routeAndRun = analyzeRouteAndRunIntent(PEAK_SEASON_MSG);
    expect(routeAndRun.sub_signals.peak_season_crowd_avoidance).toBe(true);
    expect(matchAxioms({ message: PEAK_SEASON_MSG }).some((m) => m.axiom_id === 'ETA_INFEASIBLE')).toBe(
      false,
    );

    const eta = matchAxioms(
      buildAxiomMatchContext({ message: PEAK_SEASON_MSG, routeAndRunIntent: routeAndRun }),
    ).find((m) => m.axiom_id === 'ETA_INFEASIBLE');
    expect(eta?.evidence.match_source).toBe('INTENT_SIGNAL');
    expect(eta?.evidence.proof_payload?.whale_watching_north).toBe(true);
  });
});
