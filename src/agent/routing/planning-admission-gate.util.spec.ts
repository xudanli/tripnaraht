import {
  applyPlanningAdmissionGateInPlace,
  evaluatePlanningAdmission,
  resolvePlanningOperationLockId,
} from './planning-admission-gate.util';
import { signalsFromRequest } from '../utils/orchestration-signals.util';
import { resolveStateMachineEntryRedirect, resolveOrchestrateEntry } from './request-router.util';
import { ModeLock } from '../services/orchestration-stability.util';
import { routePolicy } from './gateway-route-policy.util';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';

describe('Planning Admission Gate', () => {
  const lodgingGap = '哪一天没住宿\n\n[日程] Day1 Day 1 · 抵达雷克雅未克';

  it('默认拒绝 Full Planning：哪一天没住宿 + 前端 TRIP_PLANNING hint', () => {
    const d = evaluatePlanningAdmission({
      message: lodgingGap,
      tripId: 't1',
      intentModeHint: 'TRIP_PLANNING',
      entryPointHint: 'itinerary_day_editor',
      modeLockHint: true,
    });
    expect(d.admitted).toBe(false);
    if (!d.admitted) {
      expect(d.ignoredHints).toEqual(
        expect.arrayContaining([
          'intent_mode:TRIP_PLANNING',
          'entry_point:itinerary_day_editor',
          'ui_day_anchor',
          'mode_lock_session',
        ]),
      );
    }
  });

  it('applyInPlace：误传 TRIP_PLANNING 被降为 DATA_LOOKUP 且关闭 SM', () => {
    const req = {
      request_id: 'r1',
      user_id: 'u1',
      trip_id: 't1',
      message: lodgingGap,
      options: {
        intent_mode: 'TRIP_PLANNING',
        use_state_machine_orchestration: true,
        entry_point: 'itinerary_day_editor',
      },
    } as RouteAndRunRequestDto;
    const d = applyPlanningAdmissionGateInPlace(req);
    expect(d.admitted).toBe(false);
    expect(req.options?.intent_mode).toBe('DATA_LOOKUP');
    expect(req.options?.use_state_machine_orchestration).toBe(false);
  });

  it('signalsFromRequest：日程编辑器 + TRIP_PLANNING 仍为 DATA_LOOKUP', () => {
    const s = signalsFromRequest({
      request_id: 'r1',
      user_id: 'u1',
      trip_id: 't1',
      message: lodgingGap,
      options: {
        intent_mode: 'TRIP_PLANNING',
        use_state_machine_orchestration: true,
        entry_point: 'itinerary_day_editor',
      },
    } as RouteAndRunRequestDto);
    expect(s.taskType).toBe('DATA_LOOKUP');
    /** intent_mode 仍记录客户端 hint；taskType 由 admission 裁定 */
    expect(s.intent_mode_requested).toBe('TRIP_PLANNING');
    expect(s.intent_mode_resolved).toBe('DATA_LOOKUP');
  });

  it('SM 入口：未准入必须 redirect 轻量', () => {
    const r = resolveStateMachineEntryRedirect({
      tripId: 't1',
      message: lodgingGap,
      routingTaskType: 'TRIP_PLANNING',
    });
    expect(r.redirect).toBe(true);
    expect(r.reason).toMatch(/planning_admission_denied|task_contract_guard/);
  });

  it('orchestrate 入口：未准入禁止 PLANNING_STATE_MACHINE', () => {
    const entry = resolveOrchestrateEntry({
      tripId: 't1',
      message: lodgingGap,
      routingTaskType: 'TRIP_PLANNING',
    });
    expect(entry.mode).toBe('LIGHTWEIGHT');
    expect(entry.reason).toMatch(/planning_admission_denied|task_contract_guard/);
  });

  it('明确 mutation / replan 才放行', () => {
    expect(
      evaluatePlanningAdmission({
        message: '把第2天行程轻松一点',
        tripId: 't1',
      }).admitted,
    ).toBe(true);
    expect(
      evaluatePlanningAdmission({
        message: '帮我重新规划整个行程',
        tripId: 't1',
      }).admitted,
    ).toBe(true);
  });

  it('显式 escalation 放行', () => {
    const d = evaluatePlanningAdmission({
      message: '哪一天没住宿',
      tripId: 't1',
      explicitPlanningEscalation: true,
    });
    expect(d).toMatchObject({
      admitted: true,
      kind: 'EXPLICIT_ESCALATION',
    });
  });

  it('ModeLock 仅按 operation 绑定，不按 trip session', () => {
    const lock = new ModeLock();
    const tripOnly = {
      tripId: 't1',
      userId: 'u1',
      requestHash: 'h1',
      requestId: 'r1',
      startTs: Date.now(),
      deadline: { remainingMs: () => 1000 } as any,
    };
    lock.set(tripOnly as any, 'CLAUDE_SM');
    expect(lock.get(tripOnly as any)).toBeUndefined();

    const withOp = { ...tripOnly, modeLockOperationId: 'planop:abc' };
    lock.set(withOp as any, 'CLAUDE_SM');
    expect(lock.get(withOp as any)).toBe('CLAUDE_SM');
    expect(lock.get(tripOnly as any)).toBeUndefined();
    lock.clear(withOp as any);
    expect(lock.get(withOp as any)).toBeUndefined();
  });

  it('resolvePlanningOperationLockId：未准入不产生 lock id', () => {
    expect(
      resolvePlanningOperationLockId({
        admitted: false,
        requestId: 'ios-1',
      }),
    ).toBeUndefined();
    expect(
      resolvePlanningOperationLockId({
        admitted: true,
        requestId: 'ios-1',
      }),
    ).toBe('planop:ios-1');
  });

  it('未准入时 ModeLock 上的 CLAUDE_SM 被旁路', () => {
    const lock = new ModeLock();
    const ctx = {
      tripId: 't1',
      userId: 'u1',
      requestHash: 'h1',
      requestId: 'r1',
      startTs: Date.now(),
      deadline: { remainingMs: () => 1000 } as any,
      modeLockOperationId: 'planop:prev',
    };
    lock.set(ctx as any, 'CLAUDE_SM');
    const d = routePolicy(
      { ...process.env, USE_CLAUDE_ORCHESTRATION: 'true' } as NodeJS.ProcessEnv,
      { use_claude_orchestration: true, use_state_machine_orchestration: true },
      {
        taskType: 'DATA_LOOKUP',
        capability: 'FAST_QA',
        actionKind: 'TRIP_SCOPED_CONSULTATION',
        risk: 'LOW',
        needsAudit: false,
        latencyBudgetMs: 60000,
        complexity: 'SIMPLE',
        requiresStructuredOutput: false,
        expectsToolCalls: false,
        legacyWellSupported: true,
        intent_mode_requested: 'DATA_LOOKUP',
        intent_mode_resolved: 'DATA_LOOKUP',
      } as any,
      ctx as any,
      lock,
      undefined,
      { message: lodgingGap, tripId: 't1' },
    );
    expect(d.matchedRules).toContain('rule_mode_lock_bypass_planning_admission_denied');
    expect(d.mode).not.toBe('CLAUDE_SM');
  });
});
