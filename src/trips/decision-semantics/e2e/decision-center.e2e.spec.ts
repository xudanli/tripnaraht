/**
 * Decision Center V1.0 — five P0 acceptance chains (service-level E2E).
 *
 * Covers: list → detail → options → preview → POST decision → ledger reverse lookup → validation.
 */

import {
  buildBudgetCollected,
  buildDailyDriveCollected,
  buildGateReachabilityCollected,
  buildGateReachabilityWithBridgeCollected,
  buildRoadClosureCollected,
  buildSafetyGateCollected,
  createDecisionCenterHarness,
  TRIP_ID,
  USER_ID,
} from './decision-center.harness';
import { evaluateOutcomeValidation } from '../validation/evaluate-outcome-validation.util';
import { buildExpectedOutcomes } from '../validation/build-expected-outcomes.util';
import type { DecisionRecord } from '../types/decision-semantics.types';

describe('Decision Center — P0 E2E chains', () => {
  describe('1. road closure / unreachable (feasibility repair chain)', () => {
    it('runs list → detail → options → preview → decision → ledger reverse lookup → validation', async () => {
      const harness = createDecisionCenterHarness(buildRoadClosureCollected());
      const { service } = harness;

      const list = await service.listProblems(TRIP_ID);
      expect(list.items).toHaveLength(1);
      expect(list.items[0].primaryEnforcement).toBe('BLOCK');

      const problemId = list.items[0].id;
      const detail = await service.getProblem(TRIP_ID, problemId);
      expect(detail.assertions[0].domain).toBe('ROUTE');
      expect(detail.assertions[0].proofs.length).toBeGreaterThan(0);

      const options = await service.getOptions(TRIP_ID, problemId);
      expect(options.options.some((o) => o.id === 'bypass_via_ring')).toBe(true);
      const bypass = options.options.find((o) => o.id === 'bypass_via_ring');
      expect(bypass?.executable).toBe(false);
      expect(bypass?.repairCommand?.commandType).toBe('CHANGE_ROUTE');
      expect(bypass?.executionCapability).toBe('DIRECT');

      const preview = await service.previewOption(TRIP_ID, problemId, 'bypass_via_ring', USER_ID);
      expect(preview.proposedMutations.tripId).toBe(TRIP_ID);
      expect(preview.authority.requiredApprover).toBeDefined();

      const created = await service.createDecision(TRIP_ID, USER_ID, {
        problemId,
        selectedOptionId: 'bypass_via_ring',
        reason: '接受绕行方案',
        acknowledgement: ['已知增加 45 分钟'],
      });

      expect(created.decision.status).toBe('EXECUTED');
      expect(created.executionStatus).toBe('APPLIED');
      expect(created.problemResolution?.resolution).toBe('DECISION_EXECUTED');
      expect(created.decision.ledgerRefs?.causedByAnnotatedNodeIds).toContain('node-recompute-1');
      expect(created.tripVersionAfter).toBeDefined();

      const ledgerLookup = await service.resolveDecisionForLedgerNode(TRIP_ID, 'node-recompute-1');
      expect(ledgerLookup.decisionId).toBe(created.decision.id);

      const validation = await service.getDecisionValidation(TRIP_ID, created.decision.id);
      expect(validation.verdict).toBe('CONFIRMED');

      const overview = await service.getOverview(TRIP_ID);
      expect(overview.problemCounts.byStatus.RESOLVED).toBeGreaterThanOrEqual(1);
      expect(overview.problemCounts.open).toBe(0);

      const execution = await service.getDecisionExecutionStatus(TRIP_ID, created.decision.id);
      expect(execution.status).toBe('APPLIED');
      expect(execution.explanation).toContain('已写入行程');

      const snap = overview.recentDecisions.find((d) => d.decisionId === created.decision.id);
      expect(snap?.executionStatus).toBe('APPLIED');
      expect(snap?.recordStatus).toBe('EXECUTED');
    });
  });

  describe('DC-FE-015 idempotent replay', () => {
    it('second POST with same idempotencyKey returns idempotentReplay true', async () => {
      const harness = createDecisionCenterHarness(buildRoadClosureCollected());
      const { service, counters } = harness;

      const problemId = (await service.listProblems(TRIP_ID)).items[0].id;
      const body = {
        problemId,
        selectedOptionId: 'bypass_via_ring',
        idempotencyKey: 'idem-fe-015-bypass',
        acknowledgement: ['确认绕行'],
      };

      const first = await service.createDecision(TRIP_ID, USER_ID, body);
      expect(first.idempotentReplay).toBe(false);
      expect(first.executionStatus).toBe('APPLIED');

      const second = await service.createDecision(TRIP_ID, USER_ID, body);
      expect(second.idempotentReplay).toBe(true);
      expect(second.executionStatus).toBe('IDEMPOTENT_REPLAY');
      expect(second.effectiveDecisionId).toBe(first.decision.id);
      expect(counters.applyRepairCalls).toBe(1);
    });

    it('replays when first POST only RECORDED (no repair side effect)', async () => {
      const harness = createDecisionCenterHarness(buildGateReachabilityCollected());
      const { service, counters } = harness;

      const problemId = (await service.listProblems(TRIP_ID)).items[0].id;
      const body = {
        problemId,
        selectedOptionId: 'gate_reach_alt_route',
        idempotencyKey: 'idem-fe-015-recorded',
        acknowledgement: ['确认绕行'],
        execute: true,
      };

      const first = await service.createDecision(TRIP_ID, USER_ID, body);
      expect(first.idempotentReplay).toBe(false);
      expect(first.executionStatus).toBe('RECORDED');
      expect(counters.applyRepairCalls).toBe(0);

      const second = await service.createDecision(TRIP_ID, USER_ID, body);
      expect(second.idempotentReplay).toBe(true);
      expect(second.executionStatus).toBe('IDEMPOTENT_REPLAY');
      expect(second.effectiveDecisionId).toBe(first.decision.id);
      expect(counters.applyRepairCalls).toBe(0);
    });
  });

  describe('1b. gate reachability (fallback RULE_ENGINE options)', () => {
    it('surfaces gate repair options without feasibility issue', async () => {
      const harness = createDecisionCenterHarness(buildGateReachabilityCollected());
      const { service } = harness;

      const list = await service.listProblems(TRIP_ID);
      expect(list.items[0].detectedBy).toBe('GATE');

      const options = await service.getOptions(TRIP_ID, list.items[0].id);
      expect(options.options.map((o) => o.id)).toEqual([
        'gate_reach_alt_route',
        'gate_reach_split_leg',
        'gate_reach_change_mode',
      ]);
      expect(options.options.every((o) => o.source === 'RULE_ENGINE')).toBe(true);
      expect(options.options.every((o) => o.executable === false)).toBe(true);
      expect(options.options.every((o) => o.executionCapability === 'GUIDED_MANUAL')).toBe(true);

      const preview = await service.previewOption(
        TRIP_ID,
        list.items[0].id,
        'gate_reach_alt_route',
        USER_ID,
      );
      expect(preview.authority).toBeDefined();
      expect(preview.repairCommand?.commandType).toBe('CHANGE_ROUTE');
      expect(preview.executionCapability).toBe('GUIDED_MANUAL');
    });
  });

  describe('1c. gate reachability bridged to feasibility applyRepair', () => {
    it('executes gate option via related feasibility repair when bridge matches', async () => {
      const harness = createDecisionCenterHarness(buildGateReachabilityWithBridgeCollected());
      const { service, counters } = harness;

      const problemId = (await service.listProblems(TRIP_ID)).items[0].id;
      const options = await service.getOptions(TRIP_ID, problemId);
      const gateOption = options.options.find((o) => o.id === 'gate_reach_alt_route')!;
      expect(gateOption.executionCapability).toBe('DIRECT');

      const created = await service.createDecision(TRIP_ID, USER_ID, {
        problemId,
        selectedOptionId: 'gate_reach_alt_route',
        acknowledgement: ['确认绕行'],
      });

      expect(created.decision.status).toBe('EXECUTED');
      expect(created.problemResolution?.status).toBe('RESOLVED');
      expect(counters.applyRepairCalls).toBe(1);

      const detail = await service.getProblem(TRIP_ID, problemId);
      expect(detail.status).toBe('RESOLVED');
      expect(detail.resolvedByDecisionId).toBe(created.decision.id);
    });
  });

  describe('2. daily drive timeout — member attribution & tradeoffs', () => {
    it('exposes structured tradeoffs and member scope on multi-option compare', async () => {
      const harness = createDecisionCenterHarness(buildDailyDriveCollected());
      const { service } = harness;

      const detail = await service.getProblem(TRIP_ID, (await service.listProblems(TRIP_ID)).items[0].id);
      expect(detail.type).toBe('INFEASIBILITY');
      expect(detail.affectedScope.some((s) => s.scopeType === 'DAY')).toBe(true);
      expect(detail.affectedScopeDisplay?.some((s) => s.label.includes('第'))).toBe(true);

      const options = await service.getOptions(TRIP_ID, detail.id);
      expect(options.options.length).toBeGreaterThanOrEqual(2);

      const restOption = options.options.find((o) => o.id === 'insert_rest');
      expect(restOption?.tradeoffs.some((t) => t.dimension === 'FATIGUE')).toBe(true);

      const dropPoi = options.options.find((o) => o.id === 'drop_poi');
      expect(dropPoi?.tradeoffs.find((t) => t.dimension === 'FATIGUE' && t.direction === 'IMPROVE')?.value).toBe(95);

      expect(restOption?.repairCommand?.commandType).toBe('ADD_BUFFER');
      expect(restOption?.executionCapability).toBe('DIRECT');

      const preview = await service.previewOption(TRIP_ID, detail.id, 'insert_rest', USER_ID);
      expect(preview.tradeoffs.length).toBeGreaterThan(0);
      expect(preview.proposedMutations.operations.length).toBeGreaterThan(0);
    });
  });

  describe('3. budget increase — TRIP_OWNER authority', () => {
    it('requires trip owner confirmation for budget adjustment', async () => {
      const harness = createDecisionCenterHarness(buildBudgetCollected());
      const { service } = harness;

      const problemId = (await service.listProblems(TRIP_ID)).items[0].id;
      const preview = await service.previewOption(TRIP_ID, problemId, 'increase_budget', USER_ID);

      expect(preview.authority.requiredApprover).toBe('TRIP_OWNER');
      expect(preview.authority.decisionDomain).toBe('BUDGET');

      const proposed = await service.createDecision(TRIP_ID, USER_ID, {
        problemId,
        selectedOptionId: 'increase_budget',
      });
      expect(proposed.decision.status).toBe('PROPOSED');

      const created = await service.createDecision(TRIP_ID, USER_ID, {
        problemId,
        selectedOptionId: 'increase_budget',
        acknowledgement: ['确认提高预算'],
      });
      expect(['APPROVED', 'EXECUTED']).toContain(created.decision.status);
    });
  });

  describe('4. safety hard constraint — non-executable', () => {
    it('offers advisory-only gate options with executable false and no apply', async () => {
      const harness = createDecisionCenterHarness(buildSafetyGateCollected());
      const { service } = harness;

      const problemId = (await service.listProblems(TRIP_ID)).items[0].id;
      const detail = await service.getProblem(TRIP_ID, problemId);
      expect(detail.assertions[0].nature).toBe('HARD_CONSTRAINT');
      expect(detail.assertions[0].overridable).toBe(false);

      const options = await service.getOptions(TRIP_ID, problemId);
      expect(options.options.length).toBeGreaterThan(0);
      expect(options.options.every((o) => o.executable === false)).toBe(true);
      expect(options.options.every((o) => o.executionCapability === 'GUIDED_MANUAL')).toBe(true);

      const safetyOption = options.options.find((o) => o.id === 'gate_safety_shift_date')!;
      expect(safetyOption.repairCommand?.commandType).toBe('CHANGE_DATE');

      const created = await service.createDecision(TRIP_ID, USER_ID, {
        problemId,
        selectedOptionId: safetyOption.id,
        acknowledgement: ['已知安全风险，无法自动修改'],
      });

      expect(created.decision.status).not.toBe('EXECUTED');
      expect(created.applyResult).toBeUndefined();
    });
  });

  describe('5. execution validation verdicts', () => {
    const baseRecord: DecisionRecord = {
      id: 'dec_validation',
      tripId: TRIP_ID,
      problemId: 'dp_drive',
      selectedOptionId: 'insert_rest',
      rejectedOptionIds: [],
      decidedBy: [{ role: 'TRIP_OWNER' }],
      authoritySnapshot: {
        decisionDomain: 'SCHEDULE',
        proposer: 'SYSTEM',
        requiredApprover: 'TRIP_OWNER',
        executionMode: 'EXPLICIT_CONFIRMATION',
        overridable: true,
      },
      reasons: [],
      decidedAt: '2026-06-30T10:00:00Z',
      tripVersionBefore: '1',
      tripVersionAfter: '2',
      status: 'EXECUTED',
      validationStatus: 'PENDING',
      actualMutation: {
        mutationId: 'mut_val',
        tripId: TRIP_ID,
        operations: [
          {
            operation: 'ADD',
            entityType: 'DAY',
            semanticEffects: [
              {
                dimension: 'FATIGUE',
                direction: 'IMPROVE',
                value: 90,
                unit: 'MINUTE',
                explanation: '缩短驾驶',
              },
            ],
          },
        ],
        createdAt: '2026-06-30T10:00:00Z',
        createdBy: USER_ID,
        versionBefore: '1',
        versionAfter: '2',
      },
    };

    it('CONFIRMED when prediction matches observations', () => {
      const expected = buildExpectedOutcomes(baseRecord);
      const result = evaluateOutcomeValidation({
        record: baseRecord,
        expectedOutcomes: expected,
        observedOutcomes: [
          {
            metric: 'CONSTRAINT_VIOLATION',
            actualValue: false,
            observedAt: '2026-06-30T12:00:00Z',
            source: 'SYSTEM_INFERENCE',
            confidence: 0.9,
          },
          {
            metric: 'DRIVING_DURATION',
            actualValue: 80,
            observedAt: '2026-06-30T12:00:00Z',
            source: 'SYSTEM_INFERENCE',
            confidence: 0.9,
          },
        ],
      });
      expect(result.verdict).toBe('CONFIRMED');
    });

    it('PARTIALLY_CONFIRMED when mixed signals', () => {
      const expected = buildExpectedOutcomes(baseRecord);
      const result = evaluateOutcomeValidation({
        record: baseRecord,
        expectedOutcomes: expected,
        observedOutcomes: [
          {
            metric: 'CONSTRAINT_VIOLATION',
            actualValue: false,
            observedAt: '2026-06-30T12:00:00Z',
            source: 'SYSTEM_INFERENCE',
            confidence: 0.9,
          },
          {
            metric: 'DRIVING_DURATION',
            actualValue: 500,
            observedAt: '2026-06-30T12:00:00Z',
            source: 'SYSTEM_INFERENCE',
            confidence: 0.9,
          },
        ],
      });
      expect(result.verdict).toBe('PARTIALLY_CONFIRMED');
    });

    it('REFUTED when constraint still violated', () => {
      const expected = buildExpectedOutcomes(baseRecord);
      const result = evaluateOutcomeValidation({
        record: baseRecord,
        expectedOutcomes: expected,
        observedOutcomes: [
          {
            metric: 'CONSTRAINT_VIOLATION',
            actualValue: true,
            observedAt: '2026-06-30T12:00:00Z',
            source: 'SYSTEM_INFERENCE',
            confidence: 0.9,
          },
        ],
      });
      expect(result.verdict).toBe('REFUTED');
    });

    it('INCONCLUSIVE when no verifiable expected metrics', () => {
      const result = evaluateOutcomeValidation({
        record: baseRecord,
        expectedOutcomes: [],
        observedOutcomes: [],
      });
      expect(result.verdict).toBe('INCONCLUSIVE');
      expect(result.failureReasons).toContain('INSUFFICIENT_EVIDENCE');
    });
  });
});
