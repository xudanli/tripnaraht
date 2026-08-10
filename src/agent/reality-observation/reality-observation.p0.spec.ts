/**
 * Reality Observation Runtime P0 验收单测。
 */

import { assertObservationKeysRegistered } from './observation-capability.registry';
import {
  buildObservationPlan,
  mapCreOperationToRorTask,
  validateObservationPlanKeys,
} from './observation-plan.builder';
import { runObservationLoop } from './observation-executor';
import { freezeRealitySnapshot } from './reality-snapshot.freeze';
import { runRealityObservationRuntime } from './reality-observation.runtime';
import {
  canActivateLatentForConsumer,
  crePathAllowsLatent,
} from './latent-activation.policy';
import { resolveRealityLoadView } from './canonical-load.view';
import { buildRorSeedFacts } from './observation-seed.builder';
import { buildContextRequirementPlan } from '../context-requirement/context-requirement.service';

describe('Reality Observation Runtime P0', () => {
  it('Registry 拒绝未注册 key', () => {
    expect(assertObservationKeysRegistered(['targetDay.activities', 'user.hidden_emotional_state'])).toEqual([
      'user.hidden_emotional_state',
    ]);
  });

  it('CRE → ROR 任务映射', () => {
    expect(mapCreOperationToRorTask('ADD_ACTIVITY_TO_DAY')).toBe('ADD_ACTIVITY');
    expect(mapCreOperationToRorTask('CHECK_EXECUTABILITY', '明天还能去吗')).toBe(
      'DAY_EXECUTABILITY',
    );
    expect(mapCreOperationToRorTask('CHECK_EXECUTABILITY', '这条 F-road 能不能走')).toBe(
      'ROUTE_EXECUTABILITY',
    );
    expect(mapCreOperationToRorTask('ASK_TRIP_QUESTION')).toBeNull();
  });

  it('DAY_PACE plan 仅含注册键，且含 CRE 安全底线', () => {
    const cre = buildContextRequirementPlan({
      message: '第 3 天是不是太赶了',
      tripId: 't1',
      actionKind: 'EXISTING_TRIP_ROUTE_OPTIMIZATION',
      routingTaskType: 'TRIP_PLANNING',
      hints: { tripId: 't1', focusDayIndex: 3, message: '第 3 天是不是太赶了' },
    });
    const plan = buildObservationPlan({
      message: '第 3 天是不是太赶了',
      scope: { tripId: 't1', dayIndex: 3 },
      crePlan: cre,
      containsOutdoorActivity: true,
    });
    expect(plan).not.toBeNull();
    expect(plan!.operation).toBe('DAY_PACE');
    expect(cre.operation).toBe('ASK_TRIP_QUESTION');
    expect(cre.reason).toBe('day_pace_assessment');
    expect(validateObservationPlanKeys(plan!).ok).toBe(true);
    expect(plan!.needs.some((n) => n.contextKeys.includes('targetDay.activities'))).toBe(
      true,
    );
    expect(plan!.needs.some((n) => n.contextKeys.includes('route.travelTimeMatrix'))).toBe(
      true,
    );
  });

  it('DAY_PACE 执行推导密度并冻结 v1 Snapshot', async () => {
    const plan = buildObservationPlan({
      message: '第三天是不是安排得太赶了？',
      scope: { tripId: 't1', dayIndex: 3 },
      containsOutdoorActivity: true,
    });
    expect(plan!.operation).toBe('DAY_PACE');

    const state = await runObservationLoop(plan!, {
      byKey: {
        'targetDay.date': 3,
        'targetDay.activities': [
          { durationMinutes: 180 },
          { durationMinutes: 200 },
        ],
        'route.travelTimeMatrix': { totalMinutes: 285 },
        'booking.fixedCommitments': [],
        'team.memberCapability': { fitness: 'MEDIUM' },
        'participants': [{ id: 'p1' }],
        'environment.daylightWindow': { daylightMinutes: 430 },
      },
    });

    expect(state.derivedFacts.some((d) => d.key === 'derived.day.totalDrivingMinutes')).toBe(
      true,
    );
    expect(state.derivedFacts.find((d) => d.key === 'derived.day.scheduleDensity')?.value).toBe(
      'HIGH',
    );

    const snap = freezeRealitySnapshot({
      plan: plan!,
      state,
      message: '第三天是不是安排得太赶了？',
    });
    expect(snap.schema).toBe('tripnara/decision-reality-snapshot@v1');
    expect(snap.decisionSnapshot.schema).toBe('tripnara/decision-reality-snapshot@v1');
    expect(snap.observedFacts.every((f) => f.key !== 'user.currentFatigue')).toBe(true);
    expect(snap.latentHypotheses.some((h) => h.key === 'trip.currentPaceMismatch')).toBe(true);
    expect(snap.latentHypotheses[0]?.usagePolicy).not.toBe('CONFIRM_REQUIRED');
    /**
     * 诊断问「是不是太赶」：密度可答，疲劳为软缺口，不阻断主链。
     * 改排「太赶了，轻松一点」仍会 ASK_USER（见其它用例）。
     */
    expect(snap.nextActionAfterFreeze).toBe('PROCEED_TO_GATE');
    expect(state.lastReflection?.blockingUnknowns ?? []).not.toContain('user.currentFatigue');
  });

  it('ADD_ACTIVITY 缺产品时缺口为 FETCH，非法提案键被丢弃', async () => {
    const cre = buildContextRequirementPlan({
      message: '把冰川徒步排到第 3 天',
      tripId: 't1',
      actionKind: 'LOCAL_ITINERARY_EDIT',
      hints: {
        tripId: 't1',
        focusDayIndex: 3,
        message: '把冰川徒步排到第 3 天',
        containsOutdoorActivity: true,
      },
    });
    const plan = buildObservationPlan({
      message: '把冰川徒步排到第 3 天',
      scope: { tripId: 't1', dayIndex: 3 },
      crePlan: cre,
      containsOutdoorActivity: true,
      proposedNeeds: [
        {
          question: '读心术',
          subject: 'illegal',
          contextKeys: ['user.hidden_emotional_state'],
          reason: '非法',
          necessity: 'OPTIONAL',
          blocking: false,
        },
      ],
    });
    expect(plan!.operation).toBe('ADD_ACTIVITY');
    expect(plan!.needs.every((n) => !n.contextKeys.includes('user.hidden_emotional_state'))).toBe(
      true,
    );

    const ror = await runRealityObservationRuntime({
      message: '把冰川徒步排到第 3 天',
      scope: { tripId: 't1', dayIndex: 3 },
      crePlan: cre,
      containsOutdoorActivity: true,
      seeds: {
        byKey: {
          'trip.id': 't1',
          'targetDay.date': 3,
          'targetDay.activities': [],
          'participants': [{ id: 'p1' }],
          'team.memberCapability': {},
        },
      },
    });
    expect(ror.skipped).toBe(false);
    /** Reflect 闭环：用户可答的 REQUIRED FETCH 提升为 ASK_USER */
    expect(
      ror.snapshot!.unknowns.some(
        (u) =>
          u.key === 'experience.product' &&
          u.gapKind === 'ASK_USER' &&
          u.mustAskUser &&
          u.promotedFromFetch,
      ),
    ).toBe(true);
    expect(ror.snapshot!.nextActionAfterFreeze).toBe('ASK_USER');
    expect(ror.snapshot!.decisionSnapshot.schema).toBe('tripnara/decision-reality-snapshot@v1');
  });

  it('三层 Snapshot + Activation Policy：Gate/ASK 禁 latent，Suggest 可软约束', async () => {
    const plan = buildObservationPlan({
      message: '第三天太赶了，轻松一点',
      scope: { tripId: 't1', dayIndex: 3 },
      containsOutdoorActivity: true,
    });
    const state = await runObservationLoop(plan!, {
      byKey: {
        'targetDay.date': 3,
        'targetDay.activities': [{ durationMinutes: 200 }, { durationMinutes: 200 }],
        'route.travelTimeMatrix': { totalMinutes: 300 },
        'booking.fixedCommitments': [],
        'team.memberCapability': {},
        'participants': [],
        'environment.daylightWindow': { daylightMinutes: 400 },
      },
    });
    const snap = freezeRealitySnapshot({
      plan: plan!,
      state,
      message: '第三天太赶了，轻松一点',
    });

    expect(snap.canonicalWorldState.observedFacts).toEqual(snap.observedFacts);
    expect(snap.latentWorldState.hypotheses).toEqual(snap.latentHypotheses);
    expect(snap.latentHypotheses.length).toBeGreaterThan(0);

    expect(canActivateLatentForConsumer(snap.latentHypotheses[0]!, 'GATE')).toBe(false);
    expect(canActivateLatentForConsumer(snap.latentHypotheses[0]!, 'ASK_TRIP_QUESTION')).toBe(
      false,
    );
    expect(canActivateLatentForConsumer(snap.latentHypotheses[0]!, 'CRE_SLIM')).toBe(false);

    const askView = resolveRealityLoadView(snap, { purpose: 'ASK_TRIP_QUESTION' });
    expect(askView.mode).toBe('CANONICAL_ONLY');
    expect(askView.latentInjected).toBe(false);
    expect((askView.view as any).latentHypotheses).toEqual([]);

    const suggestView = resolveRealityLoadView(snap, {
      purpose: 'SUGGEST',
      crePlan: { operation: 'OPTIMIZE_DAY' } as any,
    });
    expect(suggestView.mode).toBe('CANONICAL_PLUS_ACTIVATED_LATENT');
    expect(suggestView.latentInjected).toBe(true);

    /** decisionSnapshot 仅 Canonical：不含 latent 假设键 */
    const ws = JSON.stringify(snap.decisionSnapshot);
    expect(ws).not.toContain('trip.currentPaceMismatch');
    expect(ws).not.toContain('"TOO_DENSE"');
    expect(snap.decisionSnapshot.unknowns.every((u) => u.blocking)).toBe(true);
  });

  it('种子构建 + 运行时产出 pace latent（Canonical 不含 latent）', async () => {
    const seeds = buildRorSeedFacts({
      scope: { tripId: 't1', dayIndex: 3 },
      tripDay: {
        dayIndex: 3,
        activities: [
          { title: '冰川', durationMinutes: 180 },
          { title: '黑沙滩', durationMinutes: 120 },
        ],
        fixedBookings: [{ id: 'b1' }],
        participants: [{ id: 'p1' }],
      },
      extras: {
        'route.travelTimeMatrix': { totalMinutes: 300 },
        'environment.daylightWindow': { daylightMinutes: 420 },
      },
    });
    expect(seeds.byKey?.['targetDay.activities']).toHaveLength(2);

    const ror = await runRealityObservationRuntime({
      message: '第三天太赶了',
      scope: { tripId: 't1', dayIndex: 3 },
      seeds,
      includeLatent: true,
      crePlan: { operation: 'OPTIMIZE_DAY', requirements: [] } as any,
    });
    expect(ror.skipped).toBe(false);
    expect(ror.snapshot!.latentHypotheses.some((h) => h.key === 'trip.currentPaceMismatch')).toBe(
      true,
    );
    expect(ror.canonicalLoad?.latentInjected).toBe(false);
    expect(JSON.stringify(ror.snapshot!.decisionSnapshot)).not.toContain('TOO_DENSE');
  });

  it('ASK_TRIP_QUESTION 跳过 ROR', async () => {
    const cre = buildContextRequirementPlan({
      message: '我想吃汉堡',
      tripId: 't1',
      routingTaskType: 'DATA_LOOKUP',
      actionKind: 'TRIP_SCOPED_CONSULTATION',
      hints: { tripId: 't1', destinationKnown: true, message: '我想吃汉堡' },
    });
    const ror = await runRealityObservationRuntime({
      message: '我想吃汉堡',
      scope: { tripId: 't1' },
      crePlan: cre,
    });
    expect(ror.skipped).toBe(true);
    expect(crePathAllowsLatent(cre.operation)).toBe(false);
  });
});
