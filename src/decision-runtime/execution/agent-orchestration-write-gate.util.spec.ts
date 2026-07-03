import {
  evaluateAgentOrchestrationWriteGate,
  isAgentTripMutationAction,
} from './agent-orchestration-write-gate.util';
import { EFFECTIVE_PLAN_WRITE_CHAIN_REQUIRED_CODE } from './effective-plan-write-chain-blocked.util';

describe('agent-orchestration-write-gate.util', () => {
  const originalChain = process.env.EFFECTIVE_PLAN_WRITE_CHAIN;

  afterEach(() => {
    if (originalChain === undefined) delete process.env.EFFECTIVE_PLAN_WRITE_CHAIN;
    else process.env.EFFECTIVE_PLAN_WRITE_CHAIN = originalChain;
  });

  it('CAS-099: detects trip mutation action names', () => {
    expect(isAgentTripMutationAction('readiness.applyRepair')).toBe(true);
    expect(isAgentTripMutationAction('feasibility-apply-repair')).toBe(true);
    expect(isAgentTripMutationAction('readiness.check')).toBe(false);
  });

  it('CAS-100: blocks mutation actions when write chain on', () => {
    process.env.EFFECTIVE_PLAN_WRITE_CHAIN = '1';
    const gate = evaluateAgentOrchestrationWriteGate('readiness.applyRepair');
    expect(gate.blocked).toBe(true);
    expect(gate.code).toBe(EFFECTIVE_PLAN_WRITE_CHAIN_REQUIRED_CODE);
    expect(gate.authorizedPaths?.length).toBeGreaterThan(0);
  });

  it('CAS-108: blocks execution-agent and trip-planner mutation actions', () => {
    process.env.EFFECTIVE_PLAN_WRITE_CHAIN = '1';
    expect(evaluateAgentOrchestrationWriteGate('execution.reorder').blocked).toBe(true);
    expect(evaluateAgentOrchestrationWriteGate('tripPlanner.applySuggestion').blocked).toBe(true);
    expect(evaluateAgentOrchestrationWriteGate('tripPlanner.fixNightActivities').blocked).toBe(true);
  });
});
