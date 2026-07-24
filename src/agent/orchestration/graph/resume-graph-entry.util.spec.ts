import { HarnessStepName } from '../../../harness/contracts/harness-step.types';
import {
  computeResumeGraphEntryFromLast,
  shouldSkipIntakeOnResume,
} from './resume-graph-entry.util';

describe('resume-graph-entry.util', () => {
  it('maps empty last step to intake', () => {
    expect(computeResumeGraphEntryFromLast(undefined)).toBe('intake');
  });

  it('maps completed INTAKE to research graph entry', () => {
    expect(computeResumeGraphEntryFromLast(HarnessStepName.INTAKE)).toBe('research');
    expect(shouldSkipIntakeOnResume(HarnessStepName.INTAKE)).toBe(true);
  });

  it('advances harness order to next graph node', () => {
    expect(computeResumeGraphEntryFromLast(HarnessStepName.RESEARCH)).toBe('gate_eval');
    expect(computeResumeGraphEntryFromLast(HarnessStepName.VERIFY)).toBe('repair');
  });
});
