import {
  buildOrchestrationGovernanceLimitsEcho,
  DECISION_MAX_REPAIR_COUNT_DEFAULT,
  DECISION_MAX_VERIFY_RESEARCH_RETRIES_DEFAULT,
  DECISION_PLAN_VERIFY_MAX_GRAPH_STEPS_DEFAULT,
  DECISION_REPAIR_UTILITY_DECAY_MAX_DEFAULT,
  REPAIR_OSCILLATION_MOVE_THRESHOLD,
  parseMaxRepairCount,
  parseMaxVerifyResearchRetries,
} from './orchestration-governance-matrix.constants';
import { parsePlanVerifyLoopBudgetConfig } from './plan-verify-loop/plan-verify-loop-transient.util';
import { RepairExecutorService } from '../execution/repair-executor.service';

describe('Orchestration Governance Matrix contract', () => {
  const cleanEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...cleanEnv };
  });

  it('documents default budget knobs (SSOT)', () => {
    expect(DECISION_MAX_REPAIR_COUNT_DEFAULT).toBe(3);
    expect(DECISION_PLAN_VERIFY_MAX_GRAPH_STEPS_DEFAULT).toBe(8);
    expect(DECISION_REPAIR_UTILITY_DECAY_MAX_DEFAULT).toBe(2);
    expect(DECISION_MAX_VERIFY_RESEARCH_RETRIES_DEFAULT).toBe(1);
    expect(REPAIR_OSCILLATION_MOVE_THRESHOLD).toBe(3);
  });

  it('plan-verify budget config reads from governance constants', () => {
    delete process.env.DECISION_MAX_REPAIR_COUNT;
    delete process.env.DECISION_PLAN_VERIFY_MAX_GRAPH_STEPS;
    delete process.env.DECISION_REPAIR_UTILITY_DECAY_MAX;
    const cfg = parsePlanVerifyLoopBudgetConfig();
    expect(cfg).toEqual({
      maxRepairs: 3,
      maxGraphSteps: 8,
      maxUtilityDeclines: 2,
    });
  });

  it('env overrides propagate consistently', () => {
    process.env.DECISION_MAX_REPAIR_COUNT = '5';
    process.env.DECISION_MAX_VERIFY_RESEARCH_RETRIES = '2';
    expect(parseMaxRepairCount()).toBe(5);
    expect(parseMaxVerifyResearchRetries()).toBe(2);
    expect(buildOrchestrationGovernanceLimitsEcho().limits.maxRepairCount).toBe(5);
    expect(buildOrchestrationGovernanceLimitsEcho().limits.maxVerifyResearchRetries).toBe(2);
  });

  it('repair executor oscillation threshold matches matrix constant', () => {
    expect((RepairExecutorService as any).OSCILLATION_MOVE_THRESHOLD).toBe(
      REPAIR_OSCILLATION_MOVE_THRESHOLD,
    );
  });

  it('governance limits echo carries schema envelope', () => {
    const echo = buildOrchestrationGovernanceLimitsEcho();
    expect(echo.schemaId).toBe('tripnara.orchestration_governance_limits@v1');
    expect(echo.limits.repairOscillationMoveThreshold).toBe(3);
    expect(echo.limits.verifyReturnToResearchEnabled).toBe(true);
  });
});
