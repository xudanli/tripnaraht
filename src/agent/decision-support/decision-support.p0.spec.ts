import {
  clearTravelDecisionStoreForTests,
  detectDecisionSupportCandidate,
  detectDecisionSelectIntent,
  detectProactiveDecisionCandidate,
  buildTravelDecisionProblem,
  putTravelDecisionProblem,
  getTravelDecisionProblem,
  commitTravelDecisionSelection,
  mergeTravelDecisionCommitmentIntoMetadata,
  buildDraftBridgeMessage,
  readTravelDecisionCommitments,
  upsertOpenTravelDecisionIntoMetadata,
  hydrateTravelDecisionStoreFromMetadata,
  buildTripDecisionStatus,
} from './index';
import {
  tryBuildDecisionSupportFastPath,
  selectTravelDecisionOption,
} from '../services/decision-support-fast-path.util';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import { assembleConversationTurnResult } from '../delivery/conversation';
import { projectDecisionProblemToTradeoffSource } from './project-decision-to-conversation.util';

describe('Decision Support P0', () => {
  beforeEach(() => clearTravelDecisionStoreForTests());

  it('detects TRIP_SCOPE explicit choice', () => {
    const c = detectDecisionSupportCandidate('我们 8 天到底走环岛还是南岸？');
    expect(c?.decisionKey).toBe('TRIP_SCOPE');
  });

  it('detects VEHICLE_ROAD_FIT', () => {
    expect(detectDecisionSupportCandidate('我们应该租两驱还是四驱？')?.decisionKey).toBe(
      'VEHICLE_ROAD_FIT',
    );
  });

  it('detects「租什么车型」→ VEHICLE_ROAD_FIT（开放问法）', () => {
    expect(detectDecisionSupportCandidate('租什么车型')?.decisionKey).toBe('VEHICLE_ROAD_FIT');
    expect(detectDecisionSupportCandidate('租什么车')?.decisionKey).toBe('VEHICLE_ROAD_FIT');
    expect(detectDecisionSupportCandidate('推荐车型')?.decisionKey).toBe('VEHICLE_ROAD_FIT');
  });

  it('fast path「租什么车型」returns decision_options card', async () => {
    const res = await tryBuildDecisionSupportFastPath(
      undefined,
      {
        request_id: 'r-car',
        user_id: 'u1',
        trip_id: 'trip-car',
        message: '租什么车型',
        options: {},
      } as RouteAndRunRequestDto,
      Date.now(),
    );
    expect(res).toBeTruthy();
    expect(res!.result.status).toBe('NEED_CONFIRMATION');
    const turn = (res!.result.payload as any).conversation_turn_result;
    expect(turn.primary_card).toBe('decision_options');
    const card = turn.cards.find((c: any) => c.kind === 'decision_options');
    expect(card?.options?.length).toBeGreaterThanOrEqual(2);
    expect(card.options.every((o: any) => o.composer_message_zh?.includes('我选择'))).toBe(
      true,
    );
    expect(res!.result.answer_text).not.toMatch(/\b2WD\b/);
    const ops = (res!.result.payload as any).suggested_operations;
    expect(ops?.[0]?.payload?.message).toMatch(/^我选择/);
    expect(ops?.[0]?.payload?.message).not.toBe('2WD');
  });

  it('D3: harness pipeline enriches card; Query 住宿缺口不得开 Decision', async () => {
    const vehicle = await tryBuildDecisionSupportFastPath(
      undefined,
      {
        request_id: 'r-d3-v',
        user_id: 'u1',
        trip_id: 'trip-d3-v',
        message: '我们租两驱还是四驱？可能要走高地 F-road',
        options: { intent_mode: 'TRIP_PLANNING' },
      } as RouteAndRunRequestDto,
      Date.now(),
    );
    expect(vehicle).toBeTruthy();
    expect(vehicle!.observability?.orchestration_mode_final).toBe('DECISION_SUPPORT_FAST_PATH');
    expect((vehicle!.observability as any)?.agent_task_contract?.taskType).toBe(
      'DECISION_SUPPORT',
    );
    expect((vehicle!.observability as any)?.decision_runtime_pipeline?.commit_authority).toBe(
      'DECISION_ONLY',
    );
    expect(
      (vehicle!.observability as any)?.decision_runtime_pipeline?.applied_to_itinerary,
    ).toBe(false);
    const problem = (vehicle!.result.payload as any).travel_decision_problem;
    expect(problem.options.find((o: any) => o.optionId === '2WD')?.feasibility).toBe('BLOCKED');
    expect(problem.recommendation?.optionId).toBe('4WD');
    expect(vehicle!.route.reasons).toContain('DECISION_SUPPORT_FAST_PATH_HARNESS');

    const lodging = await tryBuildDecisionSupportFastPath(
      undefined,
      {
        request_id: 'r-d3-q',
        user_id: 'u1',
        trip_id: 'trip-d3-q',
        message: '哪一天没住宿',
        options: { intent_mode: 'TRIP_PLANNING' },
      } as RouteAndRunRequestDto,
      Date.now(),
    );
    expect(lodging).toBeNull();
  });

  it('rejects multi-chip dump 2WD、4WD in composer', async () => {
    const open = buildTravelDecisionProblem('VEHICLE_ROAD_FIT', {
      tripId: 'trip-dump',
      message: '租什么车型',
    })!;
    putTravelDecisionProblem(open);
    const res = await tryBuildDecisionSupportFastPath(
      undefined,
      {
        request_id: 'r-dump',
        user_id: 'u1',
        trip_id: 'trip-dump',
        message: '怎么确认并继续、2WD、4WD',
        options: {},
      } as RouteAndRunRequestDto,
      Date.now(),
    );
    expect(res!.result.status).toBe('NEED_CONFIRMATION');
    expect(res!.result.answer_text).toContain('多个方案');
  });

  it('detects accommodation conflict goals', () => {
    expect(
      detectDecisionSupportCandidate('我不想天天换酒店，但也不想每天开很久')?.decisionKey,
    ).toBe('ACCOMMODATION_MOVEMENT');
  });

  it('does not steal「第三天轻松一点」into DAILY_PACE（留给改排）', () => {
    expect(detectDecisionSupportCandidate('第三天轻松一点')).toBeNull();
  });

  it('builds TRIP_SCOPE options with dimensions + recommendation', () => {
    const p = buildTravelDecisionProblem('TRIP_SCOPE', {
      tripId: 't1',
      dayCount: 8,
      winterLikely: true,
      message: '环岛还是南岸',
    });
    expect(p).toBeTruthy();
    expect(p!.options.length).toBe(3);
    expect(p!.options.every((o) => o.dimensions.length > 0)).toBe(true);
    const ring = p!.options.find((o) => o.optionId === 'RING_ROAD');
    expect(ring?.feasibility === 'BLOCKED' || ring?.feasibility === 'NEEDS_CONFIRMATION').toBe(
      true,
    );
    expect(p!.recommendation?.optionId).toBeTruthy();
  });

  it('fast path returns decision_options with dimensions', async () => {
    const req = {
      request_id: 'r1',
      user_id: 'u1',
      trip_id: 'trip-1',
      message: '我们这次应该租两驱还是四驱？',
      options: {},
    } as RouteAndRunRequestDto;

    const res = await tryBuildDecisionSupportFastPath(undefined, req, Date.now());
    expect(res).toBeTruthy();
    expect(res!.result.status).toBe('NEED_CONFIRMATION');
    const payload = res!.result.payload as any;
    expect(payload.travel_decision_problem.decisionKey).toBe('VEHICLE_ROAD_FIT');
    expect(payload.conversation_route).toBe('DECISION_SUPPORT');

    const turn = payload.conversation_turn_result;
    expect(turn.primary_card).toBe('decision_options');
    const card = turn.cards.find((c: any) => c.kind === 'decision_options');
    expect(card.decision_id).toBeTruthy();
    expect(card.options.length).toBeGreaterThanOrEqual(2);
    expect(card.options.some((o: any) => o.dimensions?.safety || o.dimensions?.budget)).toBe(
      true,
    );
    expect(turn.actions.some((a: any) => a.kind === 'select_decision_option')).toBe(true);
  });

  it('commit via options.decision_select writes COMMITTED without itinerary apply', async () => {
    const open = buildTravelDecisionProblem('TRIP_SCOPE', {
      tripId: 'trip-2',
      dayCount: 8,
      message: '环岛还是南岸',
    })!;
    putTravelDecisionProblem(open);

    const req = {
      request_id: 'r2',
      user_id: 'u1',
      trip_id: 'trip-2',
      message: '确认',
      options: {
        decision_select: { decision_id: open.decisionId, option_id: 'SOUTH_COAST' },
      },
    } as any;

    const res = await tryBuildDecisionSupportFastPath(undefined, req, Date.now());
    expect(res!.result.status).toBe('OK');
    const p = res!.result.payload as any;
    expect(p.travel_decision_problem.state).toBe('COMMITTED');
    expect(p.decision_commit.applied_to_itinerary).toBe(false);
    expect(p.decision_commit.persistence_target).toBe('TRIP_PREFERENCE');
    expect(p.decision_commit.contract_patch?.trip_scope).toBe('SOUTH_COAST');
    expect(p.suggested_operations?.[0]?.id).toBe('generate_decision_draft');
    expect(
      p.conversation_turn_result.actions.some((a: any) => a.id === 'generate_decision_draft'),
    ).toBe(true);
  });

  it('text ordinal select commits open decision', async () => {
    const open = buildTravelDecisionProblem('GLACIER_HIKE', {
      tripId: 'trip-3',
      message: '冰川徒步值得参加吗',
    })!;
    putTravelDecisionProblem(open);
    const res = await tryBuildDecisionSupportFastPath(
      undefined,
      {
        request_id: 'r3',
        user_id: 'u1',
        trip_id: 'trip-3',
        message: '1',
        options: {},
      } as RouteAndRunRequestDto,
      Date.now(),
    );
    expect(res!.result.payload).toMatchObject({
      decision_commit: { applied_to_itinerary: false },
    });
    expect((res!.result.payload as any).travel_decision_problem.state).toBe('COMMITTED');
  });

  it('assembler projects travel_decision_problem dimensions', () => {
    const problem = buildTravelDecisionProblem('ACCOMMODATION_MOVEMENT', {
      tripId: 't9',
      message: '不想换酒店也不想开太久',
    })!;
    const projected = projectDecisionProblemToTradeoffSource(problem);
    const turn = assembleConversationTurnResult({
      request_id: 'r',
      trip_id: 't9',
      answer_text: 'x',
      result_status: 'NEED_CONFIRMATION',
      prefer_primary: 'decision_options',
      tradeoff: projected,
    });
    expect(turn.primary_card).toBe('decision_options');
    const card = turn.cards.find((c) => c.kind === 'decision_options') as any;
    expect(card.options[0].dimensions).toBeTruthy();
  });

  it('detectDecisionSelectIntent parses 选择南岸', () => {
    expect(detectDecisionSelectIntent('选择南岸深度')?.optionHint).toContain('南岸');
  });

  it('commitTravelDecisionSelection rejects BLOCKED', () => {
    const p = buildTravelDecisionProblem('TRIP_SCOPE', {
      tripId: 't-block',
      dayCount: 7,
      winterLikely: true,
      message: '环岛还是南岸',
    })!;
    putTravelDecisionProblem(p);
    const ring = p.options.find((o) => o.optionId === 'RING_ROAD');
    if (ring?.feasibility === 'BLOCKED') {
      const r = commitTravelDecisionSelection({
        decisionId: p.decisionId,
        optionId: 'RING_ROAD',
      });
      expect(r.ok).toBe(false);
    }
  });

  it('merges commitment into trip metadata contract patch + travelDecisionContract', () => {
    const p = buildTravelDecisionProblem('TRIP_SCOPE', {
      tripId: 't-meta',
      dayCount: 8,
      message: '环岛还是南岸',
    })!;
    putTravelDecisionProblem(p);
    const committed = commitTravelDecisionSelection({
      decisionId: p.decisionId,
      optionId: 'SOUTH_COAST',
    });
    expect(committed.ok).toBe(true);
    if (!committed.ok) return;
    const meta = mergeTravelDecisionCommitmentIntoMetadata({ foo: 1 }, committed.problem);
    const commitments = readTravelDecisionCommitments(meta);
    expect(commitments?.byKey.TRIP_SCOPE.optionId).toBe('SOUTH_COAST');
    expect((meta.travelDecisionLatest as any).trip_scope).toBe('SOUTH_COAST');
    expect((meta.travelDecisionContract as any)?.objectives?.rankedPrinciples?.[0]).toBe(
      'SAFETY',
    );
    expect((meta.icelandSelfDrive as any)?.routeStrategy).toBe('SOUTH_COAST');
    expect(meta.planningPolicy).toBe('stability_over_coverage');
    expect(buildDraftBridgeMessage(committed.problem)).toContain('南岸');
  });

  it('VEHICLE Commit mirrors icelandSelfDrive.drivingSettings.vehicle', () => {
    const p = buildTravelDecisionProblem('VEHICLE_ROAD_FIT', {
      tripId: 't-veh',
      message: '两驱还是四驱',
    })!;
    putTravelDecisionProblem(p);
    const committed = commitTravelDecisionSelection({
      decisionId: p.decisionId,
      optionId: '2WD',
    });
    expect(committed.ok).toBe(true);
    if (!committed.ok) return;
    const meta = mergeTravelDecisionCommitmentIntoMetadata(
      { icelandSelfDrive: { productLine: 'iceland_self_drive', drivingSettings: { vehicle: {} } } },
      committed.problem,
    );
    const vehicle = (meta.icelandSelfDrive as any).drivingSettings.vehicle;
    expect(vehicle.is4wd).toBe(false);
    expect(vehicle.rentalRestrictions).toEqual(
      expect.arrayContaining(['no_f_road', 'no_highland']),
    );
    expect((meta.constraints as any).vehicleType).toBe('2WD');
    expect((meta.constraints as any).fRoadAllowed).toBe(false);
  });

  it('buildTripDecisionStatus reads open + commitments', () => {
    const open = buildTravelDecisionProblem('GLACIER_HIKE', {
      tripId: 't-st',
      message: '冰川徒步值得吗',
    })!;
    let meta = upsertOpenTravelDecisionIntoMetadata({}, open);
    putTravelDecisionProblem(open);
    const committed = commitTravelDecisionSelection({
      decisionId: open.decisionId,
      optionId: 'LIGHT_ALT',
    });
    expect(committed.ok).toBe(true);
    if (!committed.ok) return;
    meta = mergeTravelDecisionCommitmentIntoMetadata(meta, committed.problem);
    const status = buildTripDecisionStatus({ tripId: 't-st', metadata: meta });
    expect(status.open_problems.length).toBe(0);
    expect(status.commitments[0]?.optionId).toBe('LIGHT_ALT');
    expect(status.latest?.experience_preference).toBeTruthy();
  });

  it('hydrates open problems from metadata', () => {
    const open = buildTravelDecisionProblem('VEHICLE_ROAD_FIT', {
      tripId: 't-hyd',
      message: '两驱还是四驱',
    })!;
    const meta = upsertOpenTravelDecisionIntoMetadata({}, open);
    clearTravelDecisionStoreForTests();
    expect(getTravelDecisionProblem(open.decisionId)).toBeUndefined();
    const n = hydrateTravelDecisionStoreFromMetadata('t-hyd', meta);
    expect(n).toBe(1);
    expect(getTravelDecisionProblem(open.decisionId)?.decisionKey).toBe('VEHICLE_ROAD_FIT');
  });

  it('auto_draft sets pending_route_and_run_message', async () => {
    const open = buildTravelDecisionProblem('TRIP_SCOPE', {
      tripId: 'trip-ad',
      dayCount: 8,
      message: '环岛还是南岸',
    })!;
    putTravelDecisionProblem(open);
    const res = await tryBuildDecisionSupportFastPath(
      undefined,
      {
        request_id: 'rad',
        user_id: 'u1',
        trip_id: 'trip-ad',
        message: '确认',
        options: {
          decision_select: {
            decision_id: open.decisionId,
            option_id: 'SOUTH_COAST',
            auto_draft: true,
          },
        },
      } as any,
      Date.now(),
    );
    const p = res!.result.payload as any;
    expect(p.client_auto_follow?.enabled).toBe(true);
    expect(p.pending_route_and_run_message).toContain('南岸');
    expect(p.decision_commit.auto_draft_requested).toBe(true);
  });

  it('proactive: 两驱 + F-road → VEHICLE_ROAD_FIT', () => {
    const c = detectProactiveDecisionCandidate({
      tripId: 't-p',
      message: '明天想去 F208 高地看看',
      metadata: { travelDecisionLatest: { vehicle_drive: '2WD' } },
    });
    expect(c?.decisionKey).toBe('VEHICLE_ROAD_FIT');
    expect(c?.reason).toBe('system_trigger');
  });

  it('selectTravelDecisionOption HTTP helper commits', async () => {
    const open = buildTravelDecisionProblem('TRIP_SCOPE', {
      tripId: 't-http',
      dayCount: 9,
      message: '环岛还是南岸',
    })!;
    putTravelDecisionProblem(open);
    const r = await selectTravelDecisionOption({
      decisionId: open.decisionId,
      optionId: 'SOUTH_COAST',
      selectedBy: 'u1',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.problem.state).toBe('COMMITTED');
    expect(r.draftBridgeMessage).toContain('南岸');
    expect(r.contractPatch.trip_scope).toBe('SOUTH_COAST');
  });
});
