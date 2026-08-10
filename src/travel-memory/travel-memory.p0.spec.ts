/**
 * Travel Memory Runtime P0 — Planner / Resolver / Attribution / Ledger / build_context
 */

import {
  MemoryLedgerStore,
  TravelMemoryRuntimeService,
  accumulateAttributionEvidence,
  assertNoCandidateInDecisionContext,
  attributeOutcomeToMemoryCandidate,
  decisionEpisodeFromCgusTrace,
  estimateCausalAttribution,
  evaluateAttributionPromotion,
  evaluateWritePolicy,
  ingestCgusOutcomeIntoMemoryLedger,
  memoryLifecycleAffectsDecision,
  planMemoryNeeds,
  resolvePaceConflict,
  TRAVEL_MEMORY_DESIGN_PRINCIPLE,
  TRAVEL_MEMORY_OPS_RULE,
} from './index';
import type { CgusDecisionTraceV1 } from '../trips/decision/optimization/cgus-decision-trace.types';
import { CGUS_DECISION_TRACE_SCHEMA_VERSION } from '../trips/decision/optimization/cgus-decision-trace.types';

describe('Travel Memory Runtime P0', () => {
  describe('Memory Need Planner', () => {
    it('plans structured + episode routes and emits Memory Contract (deny all-history)', () => {
      const plan = planMemoryNeeds({
        task: 'SHOULD_WE_DO_GLACIER_HIKE',
        tripId: 'T1',
        day: 4,
      });
      expect(plan.memoryNeeds.some((n) => n.type === 'TRIP_MEMBER_CONSTRAINT' && n.required)).toBe(
        true,
      );
      expect(plan.memoryNeeds.some((n) => n.type === 'PACE_PREFERENCE' && n.required)).toBe(true);
      expect(plan.memoryNeeds.some((n) => n.type === 'PAST_SIMILAR_DECISION')).toBe(true);
      expect(plan.memoryNeeds.find((n) => n.type === 'PAST_SIMILAR_DECISION')?.route).toBe(
        'EPISODE',
      );
      expect(plan.contract.deny).toEqual(
        expect.arrayContaining(['ALL_USER_HISTORY', 'ALL_EPISODES']),
      );
      expect(plan.contract.maxEpisodes).toBe(3);
      expect(plan.contract.includeSemantic).toBe(false);
    });
  });

  describe('Authority Resolver', () => {
    it('Trip RELAXED beats User FAST; Reality fatigue wins over both', () => {
      const tripWins = resolvePaceConflict({
        tripPace: 'RELAXED',
        explicitUserPace: 'FAST',
      });
      expect(tripWins?.winner.value).toBe('RELAXED');
      expect(tripWins?.winner.level).toBe('TRIP_SPECIFIC');

      const realityWins = resolvePaceConflict({
        worldFatigueHigh: true,
        tripPace: 'FAST',
        explicitUserPace: 'FAST',
      });
      expect(realityWins?.winner.value).toBe('RELAXED');
      expect(realityWins?.winner.level).toBe('REALITY');
    });
  });

  describe('Ledger bitemporal + non-overwrite', () => {
    it('keeps history when pace supersedes; view shows latest', () => {
      const ledger = new MemoryLedgerStore();
      const old = ledger.append({
        subject: { type: 'USER', id: 'U1' },
        memoryType: 'PREFERENCE',
        predicate: 'travel.pace',
        value: 'INTENSIVE',
        scope: 'GLOBAL_USER',
        source: { type: 'USER_EXPLICIT' },
        confidence: 1,
        validFrom: '2025-06-01T00:00:00.000Z',
        recordedAt: '2025-06-01T00:00:00.000Z',
      });
      ledger.append({
        op: 'SUPERSEDE',
        subject: { type: 'USER', id: 'U1' },
        memoryType: 'PREFERENCE',
        predicate: 'travel.pace',
        value: 'RELAXED',
        scope: 'GLOBAL_USER',
        source: { type: 'USER_EXPLICIT' },
        confidence: 1,
        supersedesEventId: old.memoryEventId,
        validFrom: '2026-08-10T00:00:00.000Z',
        recordedAt: '2026-08-10T01:12:00.000Z',
      });

      expect(ledger.size()).toBe(2);
      expect(ledger.currentByPredicate('U1', 'travel.pace')?.value).toBe('RELAXED');
      const all = ledger.list({ subjectId: 'U1', predicate: 'travel.pace', activeOnly: false });
      expect(all.some((e) => e.value === 'INTENSIVE' && e.status === 'SUPERSEDED')).toBe(true);
      const latest = ledger.currentByPredicate('U1', 'travel.pace');
      expect(latest?.evidenceRefs?.length).toBeGreaterThan(0);
      expect(latest?.lifecycleStatus).toBe('ACTIVE');
      expect(all.find((e) => e.status === 'SUPERSEDED')?.supersededBy).toBeTruthy();
    });
  });

  describe('Write Policy', () => {
    it('P0 explicit saves; P2 weak signal keeps episode only', () => {
      const p0 = evaluateWritePolicy({ sourceType: 'USER_EXPLICIT' });
      expect(p0.allow).toBe(true);
      if (p0.allow) expect(p0.confidence).toBe(1);

      const p2 = evaluateWritePolicy({ sourceType: 'WEAK_SIGNAL' });
      expect(p2.allow).toBe(false);
      if (!p2.allow) expect(p2.keepEpisodeOnly).toBe(true);
    });
  });

  describe('CGUS → Episode → Attribution', () => {
    const baseTrace = (over: Partial<CgusDecisionTraceV1>): CgusDecisionTraceV1 => ({
      schemaVersion: CGUS_DECISION_TRACE_SCHEMA_VERSION,
      decision_id: 'D1',
      trip_id: 'T1',
      decision_type: 'ACTIVITY_SELECTION',
      candidate_ids: ['GLACIER_HIKE', 'SKIP_AND_CONTINUE'],
      hard_constraint_result: 'all_feasible',
      hard_constraint_reasons: [],
      candidate_scores: {},
      ranking: ['SKIP_AND_CONTINUE', 'GLACIER_HIKE'],
      recommended_candidate: 'SKIP_AND_CONTINUE',
      ...over,
    });

    it('override does not become preference', () => {
      const episode = decisionEpisodeFromCgusTrace({
        trace: baseTrace({
          user_action: 'OVERRIDE',
          chosen_candidate: 'GLACIER_HIKE',
          actual_outcome: {
            completed: true,
            safetyIncident: false,
            majorDelayMinutes: 110,
          },
          decision_regret: 'HIGH',
        }),
        day: 3,
        weatherRisk: 'HIGH_WIND',
      });
      expect(episode.mayPromoteToPreference).toBe(false);
      expect(episode.userAction.type).toBe('OVERRIDE');
      const attr = attributeOutcomeToMemoryCandidate(episode);
      expect(attr.candidate).toBeNull();
      // HIGH_WIND → 情境主导；无强天气时则为 WEAK_SIGNAL
      expect(['WEAK_SIGNAL_KEEP_EPISODE_ONLY', 'SITUATIONAL_NOT_PREFERENCE']).toContain(
        attr.verdict,
      );
    });

    it('accept + benign outcome yields CANDIDATE only, not profile preference', () => {
      const episode = decisionEpisodeFromCgusTrace({
        trace: baseTrace({
          user_action: 'ACCEPT',
          chosen_candidate: 'SKIP_AND_CONTINUE',
          actual_outcome: { completed: true, safetyIncident: false },
          decision_regret: 'NONE',
        }),
      });
      const attr = attributeOutcomeToMemoryCandidate(episode);
      expect(attr.verdict).toBe('CANDIDATE_INFERENCE');
      expect(attr.candidate?.status).toBe('CANDIDATE');
      expect(attr.attributionConfidence?.lifecycle).toBe('CANDIDATE');
      expect(memoryLifecycleAffectsDecision('CANDIDATE')).toBe(false);
      expect(evaluateAttributionPromotion(attr.attributionConfidence!).promote).toBe(false);
    });

    it('weather-dominated cancel does not become preference', () => {
      const episode = decisionEpisodeFromCgusTrace({
        trace: baseTrace({
          user_action: 'OVERRIDE',
          chosen_candidate: 'GLACIER_HIKE',
          override_reason: '取消',
          actual_outcome: { completed: false, safetyIncident: false },
          decision_regret: 'MEDIUM',
        }),
        weatherRisk: 'HIGH_STORM',
      });
      const causal = estimateCausalAttribution({
        outcomePolarity: 'NEGATIVE',
        weatherRisk: 'HIGH_STORM',
      });
      expect(causal.userPreferenceSignal.situationalDominant).toBe(true);
      expect(causal.causalFactors[0]?.factor).toBe('WEATHER');
      const attr = attributeOutcomeToMemoryCandidate(episode);
      expect(attr.verdict).toBe('SITUATIONAL_NOT_PREFERENCE');
      expect(attr.candidate).toBeNull();
    });

    it('promotion requires multiple episodes + confidence + no contradiction', () => {
      let acc = accumulateAttributionEvidence({
        candidateType: 'experience_preference',
        predicate: 'travel.pace',
        value: 'RELAXED',
        episodeId: 'EP1',
        episodeWeight: 0.3,
        causalAttribution: {
          schemaId: 'tripnara.causal_attribution@v1',
          version: 1,
          decisionOutcome: { result: 'POSITIVE' },
          causalFactors: [{ factor: 'UNKNOWN', weight: 1 }],
          userPreferenceSignal: { confidence: 0.5, situationalDominant: false },
        },
      });
      expect(evaluateAttributionPromotion(acc).promote).toBe(false);

      acc = accumulateAttributionEvidence({
        previous: acc,
        candidateType: 'experience_preference',
        predicate: 'travel.pace',
        value: 'RELAXED',
        episodeId: 'EP2',
        episodeWeight: 0.3,
        causalAttribution: acc.causalAttribution,
      });
      acc = accumulateAttributionEvidence({
        previous: acc,
        candidateType: 'experience_preference',
        predicate: 'travel.pace',
        value: 'RELAXED',
        episodeId: 'EP3',
        episodeWeight: 0.3,
        causalAttribution: acc.causalAttribution,
      });
      acc = { ...acc, confidence: 0.75 };
      const gate = evaluateAttributionPromotion(acc);
      expect(gate.promote).toBe(true);
      if (gate.promote) expect(gate.nextLifecycle).toBe('QUALIFIED');

      const contradicted = accumulateAttributionEvidence({
        previous: acc,
        candidateType: 'experience_preference',
        predicate: 'travel.pace',
        value: 'FAST',
        episodeId: 'EP4',
        contradicts: true,
      });
      expect(evaluateAttributionPromotion(contradicted).promote).toBe(false);
    });
  });

  describe('CGUS Outcome → Ledger ingest', () => {
    it('records episode on action; promotes weak candidate only after benign accept+outcome', () => {
      const ledger = new MemoryLedgerStore();
      const actionTrace: CgusDecisionTraceV1 = {
        schemaVersion: CGUS_DECISION_TRACE_SCHEMA_VERSION,
        decision_id: 'D-INGEST',
        trip_id: 'T1',
        decision_type: 'ACTIVITY_SELECTION',
        candidate_ids: ['A', 'B'],
        hard_constraint_result: 'all_feasible',
        hard_constraint_reasons: [],
        candidate_scores: {},
        ranking: ['A', 'B'],
        recommended_candidate: 'A',
        user_action: 'ACCEPT',
        chosen_candidate: 'A',
      };

      const afterAction = ingestCgusOutcomeIntoMemoryLedger({
        ledger,
        trace: actionTrace,
        kind: 'action',
        userId: 'U1',
      });
      expect(afterAction.episodeEvent.memoryType).toBe('DECISION_EPISODE_REF');
      expect(afterAction.candidateEvent).toBeNull();
      expect(afterAction.candidateSkippedReason).toBe('awaiting_outcome_or_action');

      const afterOutcome = ingestCgusOutcomeIntoMemoryLedger({
        ledger,
        trace: {
          ...actionTrace,
          actual_outcome: { completed: true, safetyIncident: false },
          decision_regret: 'NONE',
        },
        kind: 'outcome',
        userId: 'U1',
        previousEpisodeEventId: afterAction.episodeEvent.memoryEventId,
      });
      expect(afterOutcome.candidateEvent?.status).toBe('CANDIDATE');
      expect(
        (afterOutcome.candidateEvent?.value as { profileEligible?: boolean })?.profileEligible,
      ).toBe(false);
      expect(
        ledger.list({ subjectId: 'U1', activeOnly: false }).some(
          (e) => e.status === 'SUPERSEDED',
        ),
      ).toBe(true);
    });

    it('runtime ingest indexes episodes for build_context without caller injection', () => {
      const runtime = new TravelMemoryRuntimeService();
      runtime.ingestCgusOutcomeLoop({
        kind: 'outcome',
        userId: 'U1',
        trace: {
          schemaVersion: CGUS_DECISION_TRACE_SCHEMA_VERSION,
          decision_id: 'D-RT',
          trip_id: 'T_ICELAND',
          decision_type: 'GLACIER_ACTIVITY',
          candidate_ids: ['GLACIER_HIKE', 'SKIP'],
          hard_constraint_result: 'all_feasible',
          hard_constraint_reasons: [],
          candidate_scores: {},
          ranking: ['SKIP', 'GLACIER_HIKE'],
          recommended_candidate: 'SKIP',
          user_action: 'OVERRIDE',
          chosen_candidate: 'GLACIER_HIKE',
          actual_outcome: {
            completed: true,
            safetyIncident: false,
            majorDelayMinutes: 110,
          },
          decision_regret: 'HIGH',
        },
      });

      const pkg = runtime.buildContext({
        task: 'SHOULD_WE_DO_GLACIER_HIKE',
        tripId: 'T_ICELAND',
        userId: 'U1',
      });
      expect(pkg.relevantEpisodes.some((e) => e.sourceRefs?.cgusDecisionId === 'D-RT')).toBe(
        true,
      );
      expect(
        runtime.getRelevantDecisions({ tripId: 'T_ICELAND', decisionType: 'GLACIER' }).length,
      ).toBe(1);
    });
  });

  describe('build_context facade', () => {
    it('returns package with conflicts and design principle', () => {
      const runtime = new TravelMemoryRuntimeService();
      runtime.writeCandidate({
        subject: { type: 'USER', id: 'U1' },
        memoryType: 'PREFERENCE',
        predicate: 'travel.pace',
        value: 'FAST',
        scope: 'GLOBAL_USER',
        sourceType: 'USER_EXPLICIT',
      });
      runtime.writeCandidate({
        subject: { type: 'TRIP', id: 'T1' },
        memoryType: 'PREFERENCE',
        predicate: 'travel.pace',
        value: 'RELAXED',
        scope: 'TRIP',
        sourceType: 'USER_EXPLICIT',
      });

      const pkg = runtime.buildContext({
        task: 'SHOULD_WE_DO_GLACIER_HIKE',
        userId: 'U1',
        tripId: 'T1',
        day: 4,
        worldHints: { driverFatigueHigh: true },
        episodes: [
          decisionEpisodeFromCgusTrace({
            trace: {
              schemaVersion: CGUS_DECISION_TRACE_SCHEMA_VERSION,
              decision_id: 'D9',
              trip_id: 'T1',
              decision_type: 'GLACIER_ACTIVITY',
              candidate_ids: ['GLACIER_HIKE'],
              hard_constraint_result: 'all_feasible',
              hard_constraint_reasons: [],
              candidate_scores: {},
              ranking: ['GLACIER_HIKE'],
              user_action: 'OVERRIDE',
              chosen_candidate: 'SKIP',
              override_reason: 'activity too long (5h)',
            },
          }),
        ],
      });

      expect(pkg.schemaId).toBe('tripnara.memory_context_package@v1');
      expect(pkg.designPrinciple).toBe(TRAVEL_MEMORY_DESIGN_PRINCIPLE);
      expect(TRAVEL_MEMORY_OPS_RULE).toContain('犯更少相同的错误');
      expect(pkg.contract.deny).toContain('ALL_USER_HISTORY');
      expect(pkg.tripMemory?.paceOverride?.value).toBe('RELAXED');
      expect(pkg.conflicts[0]?.winner.level).toBe('REALITY');
      expect(pkg.relevantEpisodes.length).toBeLessThanOrEqual(pkg.contract.maxEpisodes);
      expect(pkg.relevantEpisodes.length).toBeGreaterThan(0);
      expect(pkg.memoryContext).toBeDefined();
      expect(pkg.decisionSafe).toBe(true);
      expect(assertNoCandidateInDecisionContext(pkg).ok).toBe(true);
    });
  });
});
