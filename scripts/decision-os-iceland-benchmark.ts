#!/usr/bin/env npx ts-node
/**
 * Decision OS 冰岛 / 复杂场景 benchmark
 *
 * 对标研究报告 arXiv:2605.00276 77.4% 多智能体旅行规划基线。
 *
 * 运行（快速，仅 ontology + 本地 fixture）:
 *   npx ts-node --transpile-only scripts/decision-os-iceland-benchmark.ts
 *
 * 完整（含 VERIFY + Nest 启动）:
 *   DECISION_OS_BENCHMARK_FULL=1 ENABLE_READINESS_MODULE=true SKIP_GEO_MONITORING=1 npx ts-node --transpile-only scripts/decision-os-iceland-benchmark.ts
 */

import { Logger } from '@nestjs/common';
import {
  buildBenchmarkReport,
  evaluateCasePass,
  ICELAND_BENCHMARK_CASES,
  runCausalInterventionBenchmarkCase,
  runOntologyBenchmarkCase,
  type IcelandBenchmarkCaseResult,
} from '../src/decision/validation-gateway/iceland-benchmark.runner';

const logger = new Logger('DecisionOsIcelandBenchmark');

async function runVerifyCases(): Promise<IcelandBenchmarkCaseResult[]> {
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../src/app.module');
  const { VerifyExecutorService } = await import('../src/agent/execution/verify-executor.service');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const verify = app.get(VerifyExecutorService);
    const results: IcelandBenchmarkCaseResult[] = [];
    for (const testCase of ICELAND_BENCHMARK_CASES.filter((c) => c.mode === 'verify')) {
      if (!testCase.dso || !testCase.ctx) {
        throw new Error(`verify case ${testCase.id} missing dso/ctx`);
      }
      const out = await verify.execute(testCase.dso, testCase.ctx);
      const detectedViolation = out.issues.length > 0;
      const constraintCodes = out.issues.map((i) => i.code);
      results.push({
        id: testCase.id,
        title: testCase.title,
        mode: 'verify',
        passed: evaluateCasePass(testCase.expect, detectedViolation, out.issues.length, constraintCodes),
        detectedViolation,
        issueCount: out.issues.length,
        constraintCodes,
        expect: testCase.expect,
      });
    }
    return results;
  } finally {
    await app.close();
  }
}

async function main(): Promise<void> {
  const results: IcelandBenchmarkCaseResult[] = ICELAND_BENCHMARK_CASES.filter(
    (c) => c.mode === 'ontology',
  ).map(runOntologyBenchmarkCase);

  results.push(
    ...ICELAND_BENCHMARK_CASES.filter((c) => c.mode === 'causal_intervention').map(
      runCausalInterventionBenchmarkCase,
    ),
  );

  const full = ['1', 'true', 'yes'].includes(String(process.env.DECISION_OS_BENCHMARK_FULL ?? '').toLowerCase());
  if (full) {
    logger.log('DECISION_OS_BENCHMARK_FULL=1 → 启动 Nest 跑 VERIFY 用例…');
    results.push(...(await runVerifyCases()));
  } else {
    logger.log('跳过 VERIFY 用例（设置 DECISION_OS_BENCHMARK_FULL=1 跑完整 benchmark）');
  }

  const report = buildBenchmarkReport(results);
  logger.log('\n━━━ Iceland / Complex Scenario Benchmark ━━━');
  console.log(JSON.stringify(report, null, 2));

  const failed = results.filter((r) => !r.passed);
  if (failed.length > 0) {
    logger.warn(`失败用例: ${failed.map((f) => f.id).join(', ')}`);
    process.exitCode = 1;
  } else {
    logger.log(
      `验收通过 accuracy=${report.accuracyPct}% vs industry=${report.industryBaselinePct}% (Δ${report.deltaVsIndustryPct}pp) cases=${report.totalCases}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
