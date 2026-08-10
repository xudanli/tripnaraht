import { projectTravelWorldState, projectTravelWorldStateForObservability } from './project-travel-world-state.util';
import {
  TravelEventLedgerStore,
  resetDefaultTravelEventLedgerForTests,
} from './travel-event-ledger.store';
import {
  assertMemoryNotUsedAsTruth,
  assertMemoryNotUsedAsTruthOrThrow,
  projectEpisodesFromLedgerEvents,
} from './episodic-memory.guard';
import {
  buildOutcomeReconciliation,
  projectOutcomeForObservability,
} from './outcome-reconciliation.util';
import type { TravelDecisionProblem } from '../decision-support/travel-decision.types';

describe('State & Learning Foundation', () => {
  afterEach(() => {
    resetDefaultTravelEventLedgerForTests();
  });

  describe('TravelWorldState', () => {
    it('projects trip/plan/decision/execution/risk/member/booking as PROJECTION_ONLY', () => {
      const decision = {
        decisionId: 'd1',
        decisionKey: 'vehicle_drive',
        state: 'OPEN',
        subject: { title_zh: '两驱还是四驱' },
      } as TravelDecisionProblem;

      const state = projectTravelWorldState({
        tripId: 'trip_1',
        lifecycle: 'TRAVELING',
        decisionOs: {
          revision: 'v1',
          tripId: 'trip_1',
          name: '冰岛环岛',
          destination: 'Iceland',
          startDate: '2026-08-01',
          endDate: '2026-08-10',
          days: [
            {
              date: '2026-08-03',
              items: [{ placeName: '冰河湖', type: 'attraction' }],
            },
          ],
        },
        tripMeta: { planVersion: 3, status: 'ACTIVE' },
        openDecisions: [decision],
        liveConclusion: {
          schemaId: 'nara.live_execution_conclusion.v1',
          version: 1,
          conclusionId: 'c1',
          taskId: 't1',
          questionZh: '还能去冰河湖吗',
          verdict: 'CONDITIONAL',
          conclusionZh: '有条件可去',
          alternativesZh: [],
          evidence: [],
          applyPlanAllowed: false,
          requiresStrongConfirmationToMutate: true,
        } as any,
        riskEvents: [
          {
            id: 'risk_1',
            category: 'WEATHER_NATURAL',
            urgency: 3,
            entityRef: { type: 'DAY' },
            message: '南岸大风',
            source: { provider: 'test', sourceType: 'MODEL' },
            observedAt: new Date().toISOString(),
            confidence: 0.7,
          },
        ],
        partyProfile: { party_total: 2, fitness_level: 'medium' },
        missingLodgingDays: [4],
        bookingItems: [{ dayIndex: 3, placeName: '维克', bookingStatus: 'BOOKED' }],
        correlation: { latestTurnId: 'turn_1', latestTaskId: 'task_1' },
      });

      expect(state.authority).toBe('PROJECTION_ONLY');
      expect(state.trip.tripId).toBe('trip_1');
      expect(state.plan.planVersion).toBe(3);
      expect(state.plan.daySummariesZh[0]).toMatch(/冰河湖/);
      expect(state.decisions.open[0].decisionId).toBe('d1');
      expect(state.execution.liveVerdict).toBe('CONDITIONAL');
      expect(state.execution.appliedToItinerary).toBe(false);
      expect(state.risk.eventIds).toEqual(['risk_1']);
      expect(state.members.partyTotal).toBe(2);
      expect(state.booking.missingLodgingDays).toEqual([4]);
      expect(state.correlation.latestTurnId).toBe('turn_1');
      expect(projectTravelWorldStateForObservability(state).authority).toBe(
        'PROJECTION_ONLY',
      );
    });
  });

  describe('TravelEvent Ledger', () => {
    it('links Decision / PlanVersion / ActionReceipt / AgentTurnTrace', () => {
      const store = new TravelEventLedgerStore();
      const linked = store.linkBundle({
        tripId: 'trip_1',
        turnId: 'turn_1',
        taskId: 'task_1',
        decisionId: 'd1',
        actionId: 'act_1',
        planVersion: 4,
        agentTurnTraceSchema: 'nara.agent_turn_trace@v1',
      });
      expect(linked.map((e) => e.kind).sort()).toEqual(
        ['ACTION_RECEIPT', 'AGENT_TURN_TRACE', 'DECISION', 'PLAN_VERSION'].sort(),
      );
      const byDecision = store.query({ tripId: 'trip_1', decisionId: 'd1' });
      expect(byDecision.length).toBeGreaterThanOrEqual(1);
      expect(byDecision.every((e) => e.truthPolicy === 'LEDGER_RECORD_ONLY')).toBe(
        true,
      );
    });
  });

  describe('Episodic Memory + Memory≠Truth', () => {
    it('projects three episode kinds from ledger and forbids truth roles', () => {
      const store = new TravelEventLedgerStore();
      store.append({
        kind: 'DECISION',
        correlation: { tripId: 'trip_1', decisionId: 'd1' },
      });
      store.append({
        kind: 'PLAN_VERSION',
        correlation: { tripId: 'trip_1', planVersion: 2, actionId: 'a1' },
      });
      store.append({
        kind: 'LIVE_RISK',
        correlation: { tripId: 'trip_1' },
        payload: { riskEventId: 'risk_1' },
      });
      const episodes = projectEpisodesFromLedgerEvents(store.snapshot());
      expect(episodes.map((e) => e.kind).sort()).toEqual(
        [
          'DECISION_EPISODE',
          'LIVE_RISK_EPISODE',
          'PLAN_CHANGE_EPISODE',
        ].sort(),
      );
      expect(episodes.every((e) => e.isTruth === false)).toBe(true);
      expect(episodes.every((e) => e.usagePolicy === 'CONTEXT_ONLY')).toBe(true);

      expect(assertMemoryNotUsedAsTruth({ role: 'CONTEXT', memory: episodes[0] }).ok).toBe(
        true,
      );
      expect(assertMemoryNotUsedAsTruth({ role: 'EVIDENCE', memory: episodes[0] }).ok).toBe(
        false,
      );
      expect(assertMemoryNotUsedAsTruth({ role: 'GATE' }).ok).toBe(false);
      expect(assertMemoryNotUsedAsTruth({ role: 'VERIFY' }).ok).toBe(false);
      expect(() =>
        assertMemoryNotUsedAsTruthOrThrow({ role: 'TRUTH', memory: episodes[0] }),
      ).toThrow(/Memory≠Truth/);
    });
  });

  describe('Outcome Reconciliation', () => {
    it('builds Arrival / Fatigue / Risk learning signals only', () => {
      const arrival = buildOutcomeReconciliation({
        kind: 'ARRIVAL_TIME',
        tripId: 'trip_1',
        predictedZh: '18:00 抵达',
        observedZh: '18:40 抵达',
        deltaZh: '+40min',
        observedFreshnessHint: 'VERIFIED',
      });
      const fatigue = buildOutcomeReconciliation({
        kind: 'FATIGUE',
        tripId: 'trip_1',
        predictedZh: 'MEDIUM',
        observedZh: 'HIGH',
      });
      const risk = buildOutcomeReconciliation({
        kind: 'RISK',
        tripId: 'trip_1',
        predictedZh: '南岸可通行',
        observedZh: '临时封闭',
        correlation: { decisionId: 'd1' },
      });
      expect(arrival.learningSignalOnly).toBe(true);
      expect(fatigue.kind).toBe('FATIGUE');
      expect(risk.correlation.decisionId).toBe('d1');
      expect(projectOutcomeForObservability(arrival).learning_signal_only).toBe(true);
    });
  });
});
