import { HarnessStepName } from '../../../../harness/contracts/harness-step.types';
import {
  computeResumeGraphEntryFromHarnessLast,
  harnessStepToGraphNode,
  inferHarnessActionFromFailureEvent,
  resolveGraphNodeForHarnessAction,
  suggestGraphEntryFromHarnessAdmission,
  suggestPreviousHarnessStep,
} from './harness-orchestration-edge.registry';

describe('harness-orchestration-edge.registry', () => {
  it('maps harness steps to graph nodes', () => {
    expect(harnessStepToGraphNode(HarnessStepName.VERIFY)).toBe('verify');
    expect(harnessStepToGraphNode(HarnessStepName.RESEARCH)).toBe('research');
  });

  it('suggestPreviousHarnessStep matches admission fallback', () => {
    expect(suggestPreviousHarnessStep(HarnessStepName.PLAN_GEN)).toBe(HarnessStepName.GATE_EVAL);
  });

  it('suggestGraphEntryFromHarnessAdmission returns gate_eval for PLAN_GEN fail', () => {
    const node = suggestGraphEntryFromHarnessAdmission({
      passed: false,
      harness_step: HarnessStepName.PLAN_GEN,
      run_status: 'FAILED',
      validation_results: [],
      suggested_fallback_step: HarnessStepName.GATE_EVAL,
    });
    expect(node).toBe('gate_eval');
  });

  it('infers RETURN_TO_RESEARCH from EVIDENCE_SNAPSHOT_UNBOUND', () => {
    expect(
      inferHarnessActionFromFailureEvent({
        code: 'EVIDENCE_SNAPSHOT_UNBOUND',
        severity: 'L2',
      }),
    ).toBe('RETURN_TO_RESEARCH');
  });

  it('resolveGraphNodeForHarnessAction maps VERIFY RETURN_TO_RESEARCH → research', () => {
    expect(resolveGraphNodeForHarnessAction('verify', 'RETURN_TO_RESEARCH')).toBe('research');
  });

  it('computeResumeGraphEntryFromHarnessLast advances after INTAKE', () => {
    expect(computeResumeGraphEntryFromHarnessLast(HarnessStepName.INTAKE)).toBe('research');
    expect(computeResumeGraphEntryFromHarnessLast(HarnessStepName.VERIFY)).toBe('repair');
  });
});
