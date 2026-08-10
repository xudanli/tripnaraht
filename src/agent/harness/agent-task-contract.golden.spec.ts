/**
 * Golden Cases：CASE-Q01 / G01 / G02 / A01 — TaskContract + Runtime Guard。
 * @see internal-docs/agent/nara-agent-harness-golden-cases-v1.md
 */

import {
  applyAgentTaskContractInPlace,
  compileAgentTaskContract,
  projectAgentTaskContractForTrace,
} from './compile-agent-task-contract.util';
import {
  assertCapability,
  assertFullPlanningAllowed,
} from './assert-task-capability.util';
import { resolveFastQueryContextEntry } from './task-context.registry';
import {
  buildTripLodgingCoverageAnswerZh,
  buildTripLodgingCoverageFromDays,
  isLodgingGapDirectAnswerQuery,
} from './trip-lodging-coverage-fact.util';
import { resolveStateMachineEntryRedirect } from '../routing/request-router.util';
import { signalsFromRequest } from '../utils/orchestration-signals.util';
import { ModeLock } from '../services/orchestration-stability.util';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';

describe('Nara Agent Harness Golden Cases (Sprint 1)', () => {
  describe('CASE-Q01 — 哪一天没住宿', () => {
    const message = '哪一天没住宿';

    it('compiles TRIP_QUERY READ_ONLY with lodging context', () => {
      const c = compileAgentTaskContract({
        message,
        turnId: 'turn-q01',
        tripId: 't1',
      });
      expect(c.taskType).toBe('TRIP_QUERY');
      expect(c.authority).toBe('READ_ONLY');
      expect(c.allowFullPlanning).toBe(false);
      expect(c.scope.contextRegistryKey).toBe('TRIP_QUERY_LODGING');
      expect(c.contextPolicy.required).toEqual(
        expect.arrayContaining(['DAY_LIST', 'ACCOMMODATION_ANCHORS']),
      );
      expect(c.capabilities.deny).toEqual(
        expect.arrayContaining(['PLAN', 'OPTIMIZE', 'REPAIR', 'APPLY', 'VERIFY']),
      );
      expect(assertCapability(c, 'ANSWER').ok).toBe(true);
      expect(assertCapability(c, 'PLAN').ok).toBe(false);
      expect(assertFullPlanningAllowed(c).ok).toBe(false);
    });

    it('SM entry redirects away from full planning', () => {
      const c = compileAgentTaskContract({
        message,
        turnId: 'turn-q01',
        tripId: 't1',
      });
      const r = resolveStateMachineEntryRedirect({
        tripId: 't1',
        message,
        routingTaskType: 'TRIP_PLANNING',
        taskContract: c,
      });
      expect(r.redirect).toBe(true);
      expect(String(r.reason)).toMatch(/task_contract_guard|planning_admission_denied/);
    });

    it('lodging coverage slice yields direct Chinese gap answer', () => {
      expect(isLodgingGapDirectAnswerQuery(message)).toBe(true);
      expect(resolveFastQueryContextEntry(message).key).toBe('TRIP_QUERY_LODGING');
      const slice = buildTripLodgingCoverageFromDays({
        tripId: 't1',
        days: [
          { date: '2026-06-01', items: [{ type: 'ACTIVITY', nameZh: '抵达' }] },
          { date: '2026-06-02', items: [{ type: 'HOTEL', nameZh: '雷市', placeCategory: 'HOTEL' }] },
          { date: '2026-06-03', items: [] },
        ],
      });
      const answer = buildTripLodgingCoverageAnswerZh(slice);
      expect(answer).toContain('Day1');
      expect(answer).not.toMatch(/规划整段|重排行程|SOLVER/);
    });
  });

  describe('CASE-G01 — 前端误传 TRIP_PLANNING + Day 锚', () => {
    const message = '哪一天没住宿\n\n[日程] Day1 Day 1 · 抵达雷克雅未克';

    it('hints cannot force Full Planning', () => {
      const req = {
        request_id: 'ios-g01',
        user_id: 'u1',
        trip_id: 't1',
        message,
        options: {
          intent_mode: 'TRIP_PLANNING',
          use_state_machine_orchestration: true,
          entry_point: 'itinerary_day_editor',
        },
      } as RouteAndRunRequestDto;

      const c = applyAgentTaskContractInPlace(req);
      expect(c.taskType).toBe('TRIP_QUERY');
      expect(c.allowFullPlanning).toBe(false);
      expect(c.hints?.ignoredHints ?? c.hints?.intentMode).toBeTruthy();
      expect(req.options?.intent_mode).toBe('DATA_LOOKUP');
      expect(req.options?.use_state_machine_orchestration).toBe(false);

      const s = signalsFromRequest(req);
      expect(s.taskType).toBe('DATA_LOOKUP');

      const trace = projectAgentTaskContractForTrace(c);
      expect(trace.taskType).toBe('TRIP_QUERY');
      expect(trace.allowFullPlanning).toBe(false);
    });
  });

  describe('CASE-G02 — ModeLock 不按 trip session 粘 SM', () => {
    it('without operation id, ModeLock does not stick', () => {
      const lock = new ModeLock();
      const tripCtx = {
        tripId: 't1',
        userId: 'u1',
        requestHash: 'h-prev',
        requestId: 'r-prev',
        startTs: Date.now(),
        deadline: { remainingMs: () => 1000 } as any,
      };
      lock.set(tripCtx as any, 'CLAUDE_SM');
      expect(lock.get(tripCtx as any)).toBeUndefined();

      const c = compileAgentTaskContract({
        message: '总体行程怎么样？',
        turnId: 'g02',
        tripId: 't1',
        modeLockHint: true,
      });
      expect(c.allowFullPlanning).toBe(false);
      expect(assertFullPlanningAllowed(c).ok).toBe(false);
    });
  });

  describe('CASE-A01 — 第三天轻松一点', () => {
    it('admits ITINERARY_ADJUST with draft authority', () => {
      const c = compileAgentTaskContract({
        message: '把第3天行程轻松一点',
        turnId: 'a01',
        tripId: 't1',
      });
      expect(c.taskType).toBe('ITINERARY_ADJUST');
      expect(c.authority).toBe('DRAFT_REQUIRED');
      expect(c.scope.days).toEqual([3]);
      expect(c.allowFullPlanning).toBe(true);
      expect(assertCapability(c, 'CREATE_PROPOSAL').ok).toBe(true);
      expect(assertCapability(c, 'APPLY').ok).toBe(false);
      expect(assertFullPlanningAllowed(c).ok).toBe(true);
    });
  });

  describe('Context Registry', () => {
    it('maps six fast query keys', () => {
      expect(resolveFastQueryContextEntry('哪一天没住宿').key).toBe('TRIP_QUERY_LODGING');
      expect(resolveFastQueryContextEntry('今天怎么安排').key).toBe('TRIP_QUERY_TODAY');
      expect(resolveFastQueryContextEntry('下一站是什么').key).toBe('TRIP_QUERY_NEXT');
      expect(resolveFastQueryContextEntry('还有哪些没确认').key).toBe('TRIP_QUERY_PENDING');
      expect(resolveFastQueryContextEntry('当前风险有哪些').key).toBe('TRIP_QUERY_RISK');
      expect(resolveFastQueryContextEntry('准备度怎么样').key).toBe('TRIP_QUERY_READINESS');
    });
  });

  describe('silent upgrade guard', () => {
    it('TRIP_QUERY cannot escalate to PLAN/REPAIR', () => {
      const c = compileAgentTaskContract({
        message: '第4天还没有住宿',
        turnId: 'upgrade',
        tripId: 't1',
      });
      expect(c.taskType).toBe('TRIP_QUERY');
      for (const cap of ['PLAN', 'OPTIMIZE', 'REPAIR', 'CREATE_PROPOSAL', 'APPLY'] as const) {
        expect(assertCapability(c, cap).ok).toBe(false);
      }
    });
  });
});
