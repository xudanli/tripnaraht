import { HarnessStepContractRegistryService } from '../../../harness/runtime/harness-step-contract.registry';
import { HarnessStepName } from '../../../harness/contracts/harness-step.types';
import { REQUEST_FITNESS_PROFILE_LINES_KEY } from '../../memory/utils/fitness-travel-preference-prompt.util';
import { OrchestratorContextLintService } from './orchestrator-context-lint.service';
import type { DecisionState } from '../../../decision/kernel/decision-state.types';

describe('OrchestratorContextLintService', () => {
  const prevEnabled = process.env.ORCHESTRATOR_CONTEXT_LINT_ENABLED;
  const prevStrict = process.env.ORCHESTRATOR_CONTEXT_LINT_STRICT;
  const prevMax = process.env.ORCHESTRATOR_CONTEXT_LINT_MAX_BYTES;

  afterEach(() => {
    if (prevEnabled === undefined) delete process.env.ORCHESTRATOR_CONTEXT_LINT_ENABLED;
    else process.env.ORCHESTRATOR_CONTEXT_LINT_ENABLED = prevEnabled;
    if (prevStrict === undefined) delete process.env.ORCHESTRATOR_CONTEXT_LINT_STRICT;
    else process.env.ORCHESTRATOR_CONTEXT_LINT_STRICT = prevStrict;
    if (prevMax === undefined) delete process.env.ORCHESTRATOR_CONTEXT_LINT_MAX_BYTES;
    else process.env.ORCHESTRATOR_CONTEXT_LINT_MAX_BYTES = prevMax;
  });

  const lint = () =>
    new OrchestratorContextLintService(new HarnessStepContractRegistryService());

  const minimalPlanDso = (): DecisionState =>
    ({
      userIntent: { destination: 'IS' },
      tripState: {},
      environmentState: {},
      systemState: {
        requestId: 'r1',
        startedAt: new Date().toISOString(),
        lastUpdatedAt: new Date().toISOString(),
        version: 0,
      },
      constraints: { feasible: true, violations: [] },
    }) as DecisionState;

  it('is no-op when lint disabled', () => {
    delete process.env.ORCHESTRATOR_CONTEXT_LINT_ENABLED;
    const r = lint().lintBeforePhase(HarnessStepName.PLAN_GEN, minimalPlanDso());
    expect(r.ok).toBe(true);
  });

  it('passes PLAN_GEN with contract-required inputs', () => {
    process.env.ORCHESTRATOR_CONTEXT_LINT_ENABLED = '1';
    const r = lint().lintBeforePhase(HarnessStepName.PLAN_GEN, minimalPlanDso(), {
      requestId: 'r1',
    });
    expect(r.ok).toBe(true);
    expect(r.payloadBytes).toBeGreaterThan(0);
  });

  it('flags forbidden fitness key on request payload', () => {
    process.env.ORCHESTRATOR_CONTEXT_LINT_ENABLED = '1';
    const r = lint().lintBeforePhase(HarnessStepName.PLAN_GEN, minimalPlanDso(), {
      requestPayload: { [REQUEST_FITNESS_PROFILE_LINES_KEY]: ['line1', 'line2'] },
    });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('FORBIDDEN_TRANSIENT_KEY');
  });

  it('flags context size when visibility payload exceeds max', () => {
    process.env.ORCHESTRATOR_CONTEXT_LINT_ENABLED = '1';
    process.env.ORCHESTRATOR_CONTEXT_LINT_MAX_BYTES = '64';
    const huge = minimalPlanDso();
    huge.userIntent = {
      destination: 'x'.repeat(200),
      preferences: { blob: 'y'.repeat(500) },
    };
    const r = lint().lintBeforePhase(HarnessStepName.PLAN_GEN, huge);
    expect(r.ok).toBe(false);
    expect(r.code).toBe('CONTEXT_SIZE_EXCEEDED');
  });

  it('flags unknown DSO top-level keys', () => {
    process.env.ORCHESTRATOR_CONTEXT_LINT_ENABLED = '1';
    const bad = { ...minimalPlanDso(), rogueSideChannel: { foo: 1 } } as DecisionState;
    const r = lint().lintBeforePhase(HarnessStepName.PLAN_GEN, bad);
    expect(r.ok).toBe(false);
    expect(r.code).toBe('DSO_TOP_LEVEL_VIOLATION');
  });

  it('derives phase rules from harness contract registry', () => {
    const svc = lint();
    const rule = svc.getPhaseRule(HarnessStepName.VERIFY);
    expect(rule?.allowedRead).toContain('harnessRuntime');
    expect(rule?.allowedWrite).toContain('tripState');
  });
});
