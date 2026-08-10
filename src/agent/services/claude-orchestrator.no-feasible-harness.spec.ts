describe('NO_FEASIBLE_PATH harness final status', () => {
  it('buildTerminalNoSolutionResult finalizes harness as BLOCKED not FAILED', async () => {
    // 断言迁出后的 runner 源码契约：终态枚举使用 BLOCKED
    const src = await import('fs').then((fs) =>
      fs.promises.readFile(
        require('path').join(
          __dirname,
          '../routing/orchestration-result-builders.runner.ts',
        ),
        'utf8',
      ),
    );
    const idx = src.indexOf('export function buildTerminalNoSolutionResult');
    expect(idx).toBeGreaterThan(0);
    const slice = src.slice(idx, idx + 800);
    expect(slice).toContain("finalizeHarnessTraceFromOrchestration(decisionState, 'BLOCKED')");
    expect(slice).not.toContain("finalizeHarnessTraceFromOrchestration(decisionState, 'FAILED')");
  });
});
