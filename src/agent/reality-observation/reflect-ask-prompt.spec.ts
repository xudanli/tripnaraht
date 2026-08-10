/**
 * Reflect 缺口话术 → ASK 闭环单测。
 */

import { buildObservationPlan } from './observation-plan.builder';
import { runObservationLoop } from './observation-executor';
import { freezeRealitySnapshot } from './reality-snapshot.freeze';
import {
  formatAskClarificationMessage,
  promoteFetchGapsToAskUser,
  selectAskCards,
} from './reflect-ask-prompt.util';
import { buildRorAskUserResult } from '../routing/ror-ask-user-result.util';

describe('reflect-ask-prompt closed loop', () => {
  it('「会不会太赶」诊断缺事实时不阻断 FREEZE（软缺口）', async () => {
    const plan = buildObservationPlan({
      message: 'day1会不会太赶',
      scope: { tripId: 't1', dayIndex: 1, message: 'day1会不会太赶' },
      containsOutdoorActivity: true,
    });
    expect(plan?.operation).toBe('DAY_PACE');

    const state = await runObservationLoop(plan!, {
      byKey: {
        'trip.id': 't1',
        'targetDay.date': 1,
        // 故意缺少活动/车程：诊断问仍应可冻结继续作答
      },
    });

    expect(state.lastReflection?.nextAction).toBe('FREEZE_SNAPSHOT');
    expect(state.unknowns.some((u) => u.mustAskUser && u.blocking)).toBe(false);

    const snap = freezeRealitySnapshot({
      plan: plan!,
      state,
      message: 'day1会不会太赶',
    });
    expect(snap.nextActionAfterFreeze).toBe('PROCEED_TO_GATE');
  });

  it('FETCH 耗尽后把 REQUIRED 用户可答缺口提升为 ASK_USER', async () => {
    const plan = buildObservationPlan({
      message: '把冰川徒步加到第 3 天',
      scope: { tripId: 't1', dayIndex: 3, message: '把冰川徒步加到第 3 天' },
      containsReservableActivity: true,
    });
    expect(plan?.operation).toBe('ADD_ACTIVITY');

    const state = await runObservationLoop(plan!, {
      byKey: {
        'trip.id': 't1',
        'targetDay.date': 3,
        // 故意缺少 activities / experience.product / participants
      },
    });

    expect(state.lastReflection?.nextAction).toBe('ASK_USER');
    expect(
      state.unknowns.some(
        (u) =>
          u.key === 'experience.product' &&
          u.mustAskUser &&
          u.promotedFromFetch,
      ),
    ).toBe(true);

    const snap = freezeRealitySnapshot({
      plan: plan!,
      state,
      message: '把冰川徒步加到第 3 天',
    });
    expect(snap.nextActionAfterFreeze).toBe('ASK_USER');
    expect(snap.askCards!.length).toBeGreaterThan(0);
    expect(snap.askCards!.length).toBeLessThanOrEqual(3);
    expect(snap.clarificationMessage).toMatch(/确认|体验|活动/);

    const result = buildRorAskUserResult({
      request: { request_id: 'r1', message: '把冰川徒步加到第 3 天' } as any,
      snapshot: snap,
      startTime: Date.now() - 10,
    });
    expect(result.status).toBe('NEED_USER_INPUT');
    expect((result.result as any).reflectAskClosedLoop).toBe(true);
    expect((result.result as any).askCards.length).toBeGreaterThan(0);
    expect(result.answerText).toContain('1.');
  });

  it('话术卡片含可选答复，不含生硬 key 堆砌为主文', () => {
    const cards = selectAskCards(
      [
        {
          key: 'user.currentFatigue',
          question: 'x',
          gapKind: 'ASK_USER',
          impact: 'HIGH',
          blocking: true,
          canFetch: false,
          canDerive: false,
          mustAskUser: true,
        },
        {
          key: 'vehicle.driveType',
          question: 'y',
          gapKind: 'ASK_USER',
          impact: 'HIGH',
          blocking: true,
          canFetch: false,
          canDerive: false,
          mustAskUser: true,
          promotedFromFetch: true,
        },
      ],
      {
        operation: 'DAY_PACE',
        labelZh: '评估当日节奏是否过赶/过累',
        scope: {},
        needs: [],
        completionCriteria: [],
        safetyFloorKeys: [],
        maxReflectRounds: 2,
      },
    );
    const msg = formatAskClarificationMessage({
      operation: 'DAY_PACE',
      labelZh: '评估当日节奏是否过赶/过累',
      cards,
    });
    expect(msg).toMatch(/体感|2WD|F-road/);
    expect(msg).not.toMatch(/user\.currentFatigue/);
  });

  it('promoteFetchGapsToAskUser 不追问天气/道路系统源', () => {
    const promoted = promoteFetchGapsToAskUser({
      plan: {
        operation: 'ROUTE_EXECUTABILITY',
        scope: {},
        needs: [
          {
            question: '路况',
            subject: 'road',
            contextKeys: ['road.segment.status', 'vehicle.driveType'],
            reason: 'x',
            necessity: 'REQUIRED',
            blocking: true,
          },
        ],
        completionCriteria: [],
        safetyFloorKeys: [],
        maxReflectRounds: 2,
      },
      observedFacts: [],
      derivedFacts: [],
      unknowns: [
        {
          key: 'road.segment.status',
          question: '路',
          gapKind: 'FETCH',
          impact: 'HIGH',
          blocking: false,
          canFetch: true,
          canDerive: false,
          mustAskUser: false,
        },
        {
          key: 'vehicle.driveType',
          question: '车',
          gapKind: 'FETCH',
          impact: 'HIGH',
          blocking: false,
          canFetch: true,
          canDerive: false,
          mustAskUser: false,
        },
      ],
      reflectRoundsUsed: 2,
      lastReflection: {
        sufficientlyObserved: true,
        missingFacts: [],
        conflictingFacts: [],
        blockingUnknowns: [],
        nextAction: 'FREEZE_SNAPSHOT',
        round: 2,
      },
    });
    expect(promoted.find((u) => u.key === 'road.segment.status')?.mustAskUser).not.toBe(
      true,
    );
    expect(promoted.find((u) => u.key === 'vehicle.driveType')?.mustAskUser).toBe(true);
    expect(promoted.find((u) => u.key === 'vehicle.driveType')?.askPromptZh).toMatch(
      /2WD|4WD/,
    );
  });
});
