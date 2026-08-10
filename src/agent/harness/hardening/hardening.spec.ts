import { compileAgentTaskContract, REQUEST_TASK_CONTRACT_MARK } from '../compile-agent-task-contract.util';
import { assertRuntimeTransition, detectSilentRuntimeUpgrade } from './runtime-transition.contract';
import {
  assertEvidenceSufficiencyForConclusion,
  enforceConclusionAgainstEvidence,
  normalizeEvidenceFreshness,
} from './evidence.contract';
import {
  assertAdjustmentSmPhase,
  maybeGuardAdjustmentSmPhaseFromRequest,
  projectAdjustmentCapabilityScopeForTrace,
} from './adjustment-capability-scope.util';
import { buildAgentTurnTrace, projectAgentTurnTraceForObservability } from './agent-turn-trace.util';
import {
  buildHardeningAcceptanceReport,
  type HardeningTurnSample,
} from './hardening-acceptance.metrics';

describe('Harness Hardening', () => {
  describe('Runtime Transition Contract', () => {
    it('blocks silent TRIP_QUERY → FULL_PLANNING_SM', () => {
      const r = assertRuntimeTransition({
        from: 'TRIP_QUERY',
        to: 'FULL_PLANNING_SM',
      });
      expect(r.ok).toBe(false);
      expect(detectSilentRuntimeUpgrade({ from: 'TRIP_QUERY', to: 'ITINERARY_ADJUST' })).toBe(
        true,
      );
    });

    it('allows TRIP_QUERY → ITINERARY_ADJUST with new taskId (CTA)', () => {
      const r = assertRuntimeTransition({
        from: 'TRIP_QUERY',
        to: 'ITINERARY_ADJUST',
        newTaskId: true,
      });
      expect(r.ok).toBe(true);
    });

    it('allows LIVE → ITINERARY_ADJUST only with strong confirmation', () => {
      expect(
        assertRuntimeTransition({
          from: 'LIVE_EXECUTION',
          to: 'ITINERARY_ADJUST',
        }).ok,
      ).toBe(false);
      expect(
        assertRuntimeTransition({
          from: 'LIVE_EXECUTION',
          to: 'ITINERARY_ADJUST',
          strongConfirmation: true,
        }).ok,
      ).toBe(true);
    });
  });

  describe('Evidence Contract', () => {
    it('rejects STRONG without VERIFIED evidence', () => {
      const r = assertEvidenceSufficiencyForConclusion({
        desiredStrength: 'STRONG',
        evidence: [
          { key: 'delay', valueZh: '晚2小时', freshness: 'ASSUMED' },
        ],
      });
      expect(r.ok).toBe(false);
    });

    it('allows STRONG with VERIFIED (LIVE→VERIFIED)', () => {
      expect(normalizeEvidenceFreshness('LIVE')).toBe('VERIFIED');
      const r = assertEvidenceSufficiencyForConclusion({
        desiredStrength: 'STRONG',
        evidence: [
          { key: 'road', valueZh: '通行', freshness: 'VERIFIED', source: 'road_mcp' },
        ],
      });
      expect(r.ok).toBe(true);
    });

    it('enforceConclusionAgainstEvidence downgrades YES without verified', () => {
      const next = enforceConclusionAgainstEvidence(
        { verdict: 'YES', conclusionZh: '可以去' },
        [{ key: 'x', valueZh: '猜的', freshness: 'ASSUMED' }],
      );
      expect(next.verdict).toBe('CONDITIONAL');
      expect(next.conclusionZh).toMatch(/降级/);
    });
  });

  describe('Adjustment Capability Scope', () => {
    it('PLAN_GEN/SOLVER/REPAIR allowed; APPLY denied before confirm', () => {
      const c = compileAgentTaskContract({
        message: '把第3天行程轻松一点',
        turnId: 'h-adj',
        tripId: 't1',
      });
      expect(assertAdjustmentSmPhase(c, 'PLAN_GEN').ok).toBe(true);
      expect(assertAdjustmentSmPhase(c, 'SOLVER').ok).toBe(true);
      expect(assertAdjustmentSmPhase(c, 'REPAIR').ok).toBe(true);
      expect(assertAdjustmentSmPhase(c, 'APPLY').ok).toBe(false);
      const trace = projectAdjustmentCapabilityScopeForTrace(c);
      expect(trace.allow).toMatchObject({ PLAN_GEN: true, APPLY: false });
    });

    it('TRIP_QUERY cannot enter PLAN_GEN', () => {
      const q = compileAgentTaskContract({
        message: '哪一天没住宿',
        turnId: 'h-q',
        tripId: 't1',
      });
      expect(assertAdjustmentSmPhase(q, 'PLAN_GEN').ok).toBe(false);
    });

    it('maybeGuard skips non-adjust request', () => {
      expect(() =>
        maybeGuardAdjustmentSmPhaseFromRequest(
          { request_id: 'r1', message: 'hi' },
          'PLAN_GEN',
        ),
      ).not.toThrow();
    });

    it('maybeGuard throws when TRIP_QUERY marked as contract tries PLAN_GEN', () => {
      const q = compileAgentTaskContract({
        message: '哪一天没住宿',
        turnId: 'h-q2',
        tripId: 't1',
      });
      expect(() =>
        maybeGuardAdjustmentSmPhaseFromRequest(
          { [REQUEST_TASK_CONTRACT_MARK]: q },
          'PLAN_GEN',
        ),
      ).toThrow(/AdjustmentCapabilityScope/);
    });
  });

  describe('AgentTurnTrace', () => {
    it('records Task→Context→Evidence→Runtime→Capability→Result→Action', () => {
      const c = compileAgentTaskContract({
        message: '哪一天没住宿',
        turnId: 'trace-1',
        tripId: 't1',
      });
      const trace = buildAgentTurnTrace({
        contract: c,
        runtimeSelected: 'TRIP_QUERY',
        acquiredContextKeys: ['DAY_LIST', 'ACCOMMODATION_ANCHORS'],
        evidence: [
          {
            key: 'lodging_gap',
            valueZh: 'Day1缺住',
            freshness: 'VERIFIED',
            source: 'trip_slice',
          },
        ],
        attemptedCapabilities: ['ANSWER', 'PLAN'],
        deniedCapabilities: ['PLAN'],
        resultStatus: 'OK',
        answerPreviewZh: '缺住宿日是 Day1',
        appliedToItinerary: false,
      });
      expect(trace.task.taskType).toBe('TRIP_QUERY');
      expect(trace.context.acquiredKeys).toContain('DAY_LIST');
      expect(trace.evidence.bucket.verified).toBe(1);
      expect(trace.capability.denied).toContain('PLAN');
      expect(trace.action.appliedToItinerary).toBe(false);
      expect(projectAgentTurnTraceForObservability(trace).unauthorized_write_attempt).toBe(
        false,
      );
    });
  });

  describe('Acceptance metrics (后三项必须为 0)', () => {
    it('golden samples pass with zero capability/strong/write violations', () => {
      const q = compileAgentTaskContract({
        message: '哪一天没住宿',
        turnId: 'm1',
        tripId: 't1',
      });
      const live = compileAgentTaskContract({
        message: '我们晚两个小时，还能去冰河湖吗？',
        turnId: 'm2',
        tripId: 't1',
      });
      const adj = compileAgentTaskContract({
        message: '把第3天行程轻松一点',
        turnId: 'm3',
        tripId: 't1',
      });

      const samples: HardeningTurnSample[] = [
        {
          contract: q,
          runtimeFrom: 'TRIP_QUERY',
          runtimeTo: 'TRIP_QUERY',
          attemptedCapabilities: ['ANSWER', 'READ_TRIP'],
          strongVerdict: undefined,
          writeAttempt: false,
        },
        {
          contract: live,
          runtimeTo: 'LIVE_EXECUTION',
          attemptedCapabilities: ['ANSWER'],
          /** 无 VERIFIED 时不得报强结论样本 */
          strongVerdict: 'CONDITIONAL',
          evidence: [{ key: 'delay', valueZh: '2h', freshness: 'ASSUMED' }],
          writeAttempt: false,
        },
        {
          contract: live,
          runtimeTo: 'LIVE_EXECUTION',
          attemptedCapabilities: ['ANSWER'],
          strongVerdict: 'NO',
          evidence: [
            {
              key: 'road',
              valueZh: '封路',
              freshness: 'VERIFIED',
              source: 'safetravel',
            },
          ],
          writeAttempt: false,
        },
        {
          contract: adj,
          runtimeFrom: 'TRIP_QUERY',
          runtimeTo: 'ITINERARY_ADJUST',
          newTaskId: true,
          attemptedCapabilities: ['PLAN', 'SOLVER', 'REPAIR'],
          writeAttempt: true,
          writeAuthorized: false, // Confirm 前未授权写 — 样本应记为「未尝试授权写」或 writeAttempt false
        },
      ];

      /** Confirm 前 writeAttempt 必须为 false，否则计入未授权写入 */
      samples[3].writeAttempt = false;

      const report = buildHardeningAcceptanceReport(samples);
      expect(report.capabilityPrivilegeEscalationCount).toBe(0);
      expect(report.strongConclusionWithoutEvidenceCount).toBe(0);
      expect(report.unauthorizedWriteCount).toBe(0);
      expect(report.capabilityPrivilegeEscalationRate).toBe(0);
      expect(report.strongConclusionWithoutEvidenceRate).toBe(0);
      expect(report.unauthorizedWriteRate).toBe(0);
      expect(report.pass).toBe(true);
    });

    it('detects capability / strong / write violations when present', () => {
      const q = compileAgentTaskContract({
        message: '哪一天没住宿',
        turnId: 'bad',
        tripId: 't1',
      });
      const report = buildHardeningAcceptanceReport([
        {
          contract: q,
          runtimeFrom: 'TRIP_QUERY',
          runtimeTo: 'FULL_PLANNING_SM',
          attemptedCapabilities: ['PLAN'],
          strongVerdict: 'YES',
          evidence: [{ key: 'x', valueZh: '猜', freshness: 'ASSUMED' }],
          writeAttempt: true,
          writeAuthorized: false,
        },
      ]);
      expect(report.runtimePrivilegeEscalationCount).toBe(1);
      expect(report.capabilityPrivilegeEscalationCount).toBe(1);
      expect(report.strongConclusionWithoutEvidenceCount).toBe(1);
      expect(report.unauthorizedWriteCount).toBe(1);
      expect(report.pass).toBe(false);
    });
  });
});
