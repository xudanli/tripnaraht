/**
 * Harness × route_and_run 回归：Contract / Entry / RouteClass / Live·Decision 快路径。
 */

import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import { applyRouteAndRunEntryRoutingInPlace } from '../routing/route-and-run-route-class-fork.util';
import { classifyRouteAndRunRouteClass } from '../routing/route-and-run-route-class.util';
import { readAgentTaskContract } from './compile-agent-task-contract.util';
import { tryBuildLiveExecutionFastPath } from '../services/live-execution-fast-path.util';
import { tryBuildDecisionSupportFastPath } from '../services/decision-support-fast-path.util';
import { clearTravelDecisionStoreForTests } from '../decision-support';

const TRIP = '00000000-0000-4000-8000-0000000000aa';

function baseReq(message: string, extra?: Partial<RouteAndRunRequestDto>): RouteAndRunRequestDto {
  return {
    request_id: `harness-reg-${Date.now()}`,
    user_id: 'u-reg',
    trip_id: TRIP,
    message,
    options: {
      intent_mode: 'TRIP_PLANNING',
      use_state_machine_orchestration: true,
      entry_point: 'itinerary_day_editor',
    },
    ...extra,
  } as RouteAndRunRequestDto;
}

describe('Harness route-and-run regression', () => {
  beforeEach(() => clearTravelDecisionStoreForTests());

  it('CASE-Q01/G01: 哪一天没住宿 → TRIP_QUERY + QUICK_ANSWER，不进 Full Planning', () => {
    const req = baseReq('哪一天没住宿\n\n[日程] Day1');
    applyRouteAndRunEntryRoutingInPlace(req);
    const c = readAgentTaskContract(req)!;
    expect(c.taskType).toBe('TRIP_QUERY');
    expect(c.allowFullPlanning).toBe(false);
    expect(req.options?.intent_mode).toBe('DATA_LOOKUP');
    expect(req.options?.use_state_machine_orchestration).toBe(false);
    expect(classifyRouteAndRunRouteClass(req).routeClass).toBe('QUICK_ANSWER');
  });

  it('CASE-E01: Live fast path returns conclusion without itinerary apply', async () => {
    const req = baseReq('我们晚两个小时，还能去冰河湖吗？', {
      options: {
        intent_mode: 'TRIP_PLANNING',
        live_sensor_evidence: {
          weather_risk_zh: '南岸阵风偏大',
          road_alert_zh: '1号公路通行',
          skip_host_fetch: true,
        },
        remaining_drive_hours: 3.5,
      } as any,
    });
    applyRouteAndRunEntryRoutingInPlace(req);
    expect(readAgentTaskContract(req)?.taskType).toBe('LIVE_EXECUTION');
    expect(classifyRouteAndRunRouteClass(req).routeClass).toBe('QUICK_ANSWER');

    const res = await tryBuildLiveExecutionFastPath(undefined, req, Date.now());
    expect(res).toBeTruthy();
    expect(res!.observability?.orchestration_mode_final).toBe('LIVE_EXECUTION_FAST_PATH');
    expect((res!.result.payload as any).applied_to_itinerary).toBe(false);
    expect(res!.result.answer_text).toMatch(/冰河湖|不会自动改行程/);
    expect((res!.observability as any).live_execution_conclusion.verdict).toMatch(
      /YES|NO|CONDITIONAL/,
    );
  });

  it('CASE-D01: Decision fast path with harness pipeline', async () => {
    const req = baseReq('我们租两驱还是四驱？可能要走高地 F-road');
    applyRouteAndRunEntryRoutingInPlace(req);
    expect(readAgentTaskContract(req)?.taskType).toBe('DECISION_SUPPORT');
    const res = await tryBuildDecisionSupportFastPath(undefined, req, Date.now());
    expect(res).toBeTruthy();
    expect((res!.observability as any).decision_runtime_pipeline?.applied_to_itinerary).toBe(
      false,
    );
    const problem = (res!.result.payload as any).travel_decision_problem;
    expect(problem.options.find((o: any) => o.optionId === '2WD')?.feasibility).toBe('BLOCKED');
  });

  it('CASE-A01: 第三天轻松一点 → ITINERARY_ADJUST + PARTIAL_REPLAN', () => {
    const req = baseReq('把第3天行程轻松一点');
    applyRouteAndRunEntryRoutingInPlace(req);
    const c = readAgentTaskContract(req)!;
    expect(c.taskType).toBe('ITINERARY_ADJUST');
    expect(c.scope.days).toEqual([3]);
    expect(c.allowFullPlanning).toBe(true);
    expect(classifyRouteAndRunRouteClass(req).routeClass).toBe('PARTIAL_REPLAN');
  });

  it('Live hard road block forces NO', async () => {
    const req = baseReq('晚1小时还能去冰河湖吗？', {
      options: {
        live_sensor_evidence: {
          road_alert_zh: '路段封闭不可通行 CLOSED',
          skip_host_fetch: true,
        },
      } as any,
    });
    const res = await tryBuildLiveExecutionFastPath(undefined, req, Date.now());
    expect((res!.observability as any).live_execution_conclusion.verdict).toBe('NO');
  });
});
