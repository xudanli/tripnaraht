import { projectTravelWorldState } from '../project-travel-world-state.util';
import {
  attachTravelWorldStateQuality,
  checkTravelWorldStateConsistency,
} from './world-state-quality.util';
import {
  appendCausalChain,
  replayCausalChain,
  projectCausalReplayForObservability,
} from './causal-chain.util';
import { assembleEpisodesFromLedger } from './episode-assembler.util';
import {
  triggerOutcomeReconciliationFromExecution,
  resolveOutcomeTrigger,
} from './outcome-trigger.registry';
import {
  assertLearningDoesNotMutatePolicy,
  assertLearningDoesNotMutatePolicyOrThrow,
  emitLearningSignal,
} from './learning-signal.registry';
import { runDecisionReplay } from './decision-replay.harness';
import {
  TravelEventLedgerStore,
  resetDefaultTravelEventLedgerForTests,
} from '../travel-event-ledger.store';

describe('State & Learning Hardening', () => {
  afterEach(() => {
    resetDefaultTravelEventLedgerForTests();
  });

  describe('WorldState quality + consistency', () => {
    it('attaches provenance/freshness/confidence and flags mismatches', () => {
      const base = projectTravelWorldState({
        tripId: 'trip_q',
        tripMeta: { planVersion: 2 },
        missingLodgingDays: [1],
        liveConclusion: {
          schemaId: 'nara.live_execution_conclusion.v1',
          version: 1,
          conclusionId: 'c',
          taskId: 't',
          questionZh: 'q',
          verdict: 'YES',
          conclusionZh: '可以',
          alternativesZh: [],
          evidence: [],
          applyPlanAllowed: false,
          requiresStrongConfirmationToMutate: true,
        } as any,
        correlation: { latestPlanVersion: 3 },
      });
      const withQ = attachTravelWorldStateQuality(base);
      expect(withQ.quality.slices.trip.provenance.length).toBeGreaterThanOrEqual(0);
      expect(withQ.quality.overallConfidence).toBeGreaterThan(0);
      const check = checkTravelWorldStateConsistency(withQ);
      expect(check.ok).toBe(false);
      expect(check.issues.some((i) => i.code === 'PLAN_VERSION_MISMATCH')).toBe(true);
    });
  });

  describe('Causal chain replay', () => {
    it('replays Turn→Task→Decision→Proposal→Verify→Action→PlanVersion→Outcome', () => {
      const ledger = new TravelEventLedgerStore();
      appendCausalChain(ledger, {
        tripId: 'trip_c',
        turnId: 'turn_c',
        taskId: 'task_c',
        decisionId: 'd1',
        proposalId: 'p1',
        verifyOk: true,
        actionId: 'a1',
        planVersion: 4,
        outcomeId: 'o1',
      });
      const replay = replayCausalChain(ledger, { tripId: 'trip_c', turnId: 'turn_c' });
      expect(replay.complete).toBe(true);
      expect(replay.frames.map((f) => f.phase)).toEqual([
        'TURN',
        'TASK',
        'DECISION',
        'PROPOSAL',
        'VERIFY',
        'ACTION',
        'PLAN_VERSION',
        'OUTCOME',
      ]);
      expect(projectCausalReplayForObservability(replay).complete).toBe(true);
    });
  });

  describe('Episode Assembler', () => {
    it('assembles three episode kinds without expanding memory types', () => {
      const ledger = new TravelEventLedgerStore();
      appendCausalChain(ledger, {
        tripId: 'trip_e',
        turnId: 'turn_e',
        decisionId: 'd2',
        proposalId: 'p2',
        verifyOk: true,
        actionId: 'a2',
        planVersion: 5,
      });
      ledger.append({
        kind: 'LIVE_RISK',
        correlation: { tripId: 'trip_e', turnId: 'turn_e' },
        payload: { riskEventId: 'risk_x' },
      });
      const bundle = assembleEpisodesFromLedger(ledger, { tripId: 'trip_e' });
      expect(bundle.memoryTruthOk).toBe(true);
      const kinds = new Set(bundle.episodes.map((e) => e.kind));
      expect(kinds.has('DECISION_EPISODE')).toBe(true);
      expect(kinds.has('PLAN_CHANGE_EPISODE')).toBe(true);
      expect(kinds.has('LIVE_RISK_EPISODE')).toBe(true);
      expect(bundle.episodes.every((e) => e.isTruth === false)).toBe(true);
    });
  });

  describe('Outcome Trigger Registry', () => {
    it('maps execution events to Arrival/Fatigue/Risk reconciliation', () => {
      expect(resolveOutcomeTrigger('ARRIVAL_OBSERVED')?.outcomeKind).toBe('ARRIVAL_TIME');
      const ledger = new TravelEventLedgerStore();
      const r = triggerOutcomeReconciliationFromExecution({
        ledger,
        event: {
          kind: 'FATIGUE_REPORTED',
          tripId: 'trip_o',
          observedZh: 'HIGH',
          predictedZh: 'LOW',
          turnId: 'turn_o',
        },
      });
      expect(r.triggered).toBe(true);
      expect(r.outcomeKind).toBe('FATIGUE');
      expect(r.outcome?.learningSignalOnly).toBe(true);
      expect(ledger.query({ tripId: 'trip_o', kind: 'OUTCOME' })).toHaveLength(1);
    });
  });

  describe('Learning Signal Registry', () => {
    it('emits signals and denies policy mutation', () => {
      expect(assertLearningDoesNotMutatePolicy('GATE').ok).toBe(false);
      expect(assertLearningDoesNotMutatePolicy('SOLVER_WEIGHT').ok).toBe(false);
      expect(() => assertLearningDoesNotMutatePolicyOrThrow('CONTRACT')).toThrow(
        /Learning≠Policy/,
      );
      const sig = emitLearningSignal({
        kind: 'RISK_BIAS',
        summaryZh: '南岸风偏差',
        payload: { delta: 'higher' },
      });
      expect(sig.mutatesPolicy).toBe(false);
      expect(() =>
        emitLearningSignal({
          kind: 'GENERIC_OBSERVATION',
          summaryZh: 'bad',
          payload: { solver_weight_delta: 1 },
        }),
      ).toThrow(/LEARNING_SIGNAL_FORBIDDEN_KEY/);
    });
  });

  describe('Decision Replay Harness', () => {
    it('replays runtime against actual outcome and emits non-mutating signal', () => {
      const world = attachTravelWorldStateQuality(
        projectTravelWorldState({
          tripId: 'trip_r',
          tripMeta: { planVersion: 1 },
          correlation: { latestPlanVersion: 1 },
        }),
      );
      const result = runDecisionReplay({
        historicalWorldState: world,
        evidence: [
          { key: 'road', valueZh: '通行', freshness: 'VERIFIED' },
        ],
        questionZh: '两驱还是四驱',
        actualOutcome: { valueZh: '四驱', source: 'user_commit' },
        runtimeFn: () => ({ verdictOrChoiceZh: '两驱', confidence: 0.6 }),
      });
      expect(result.match).toBe(false);
      expect(result.learningSignal.kind).toBe('DECISION_REPLAY_DELTA');
      expect(result.learningSignal.mutatesPolicy).toBe(false);
      expect(result.policyMutationAttempted).toBe(false);
      expect(result.policyMutationDeniedTargets).toEqual(
        expect.arrayContaining(['CONTRACT', 'GATE', 'SOLVER_WEIGHT']),
      );
    });
  });
});
