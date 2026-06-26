import {
  buildBenchmarkReport,
  ICELAND_BENCHMARK_CASES,
  runOntologyBenchmarkCase,
} from './iceland-benchmark.runner';

describe('Iceland benchmark runner (ontology)', () => {
  it('runs ontology fixture cases', () => {
    const ontologyCases = ICELAND_BENCHMARK_CASES.filter((c) => c.mode === 'ontology');
    const results = ontologyCases.map(runOntologyBenchmarkCase);
    const report = buildBenchmarkReport(results);
    expect(report.totalCases).toBe(4);
    expect(report.passedCases).toBe(4);
    expect(report.accuracyPct).toBe(100);
  });
});
