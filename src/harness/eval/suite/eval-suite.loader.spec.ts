import { EvalSuiteLoader } from './eval-suite.loader';

describe('EvalSuiteLoader', () => {
  it('loads lite-smoke-suite from fixtures', () => {
    const loader = new EvalSuiteLoader();
    const suite = loader.loadSuite('lite-smoke-suite');
    expect(suite.suiteId).toBe('lite-smoke-suite');
    expect(suite.cases.length).toBeGreaterThanOrEqual(4);
    expect(suite.env?.ORCHESTRATOR_CONTEXT_LINT_STRICT).toBe('1');
  });
});
