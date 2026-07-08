import {
  isDecisionCheckerChangePreviewEnabled,
  isDecisionProblemSsotStoreEnabled,
  isPlanningConflictsFromProblemOnlyEnabled,
  shouldUseUnifiedDecisionReadModel,
} from './decision-problem-ssot.config';

describe('decision-problem-ssot.config', () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
    delete process.env.DECISION_PROBLEM_SSOT_STORE;
    delete process.env.PLANNING_CONFLICTS_FROM_PROBLEM_ONLY;
    delete process.env.DECISION_CHECKER_CHANGE_PREVIEW;
    delete process.env.DECISION_GATEWAY_UNIFIED;
  });

  afterAll(() => {
    process.env = env;
  });

  it('CAS-019: SSOT store enables unified read model and problem-only projection', () => {
    process.env.DECISION_PROBLEM_SSOT_STORE = '1';
    expect(isDecisionProblemSsotStoreEnabled()).toBe(true);
    expect(shouldUseUnifiedDecisionReadModel()).toBe(true);
    expect(isPlanningConflictsFromProblemOnlyEnabled()).toBe(true);
    expect(isDecisionCheckerChangePreviewEnabled()).toBe(true);
  });
});
