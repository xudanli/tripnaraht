#!/usr/bin/env npx ts-node
/**
 * L1 编排 smoke 薄入口（梯队 2）。
 *
 *   npx ts-node --transpile-only scripts/replay-cgus-lite.ts
 *   HARNESS_EVAL_RECORD_BASELINE=1 npx ts-node --transpile-only scripts/replay-cgus-lite.ts
 *
 * 强制环境：ORCHESTRATOR_CONTEXT_LINT_STRICT=1、HARNESS_TRACE_MODE=on-failure
 */
import { NestFactory } from '@nestjs/core';
import { HarnessEvalCliModule } from '../src/harness/eval/harness-eval-cli.module';
import { L1SmokeGateService } from '../src/harness/eval/compare/l1-smoke-gate.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(HarnessEvalCliModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const smokeGate = app.get(L1SmokeGateService);
    const result = await smokeGate.runSuite('lite-smoke-suite');
    if (result.warnings.length) {
      for (const w of result.warnings) {
        process.stderr.write(`[L1 smoke warn] ${w}\n`);
      }
    }
    if (!result.passed) {
      for (const e of result.errors) {
        process.stderr.write(`[L1 smoke error] ${e}\n`);
      }
      process.exit(1);
    }
    process.stdout.write(
      `[L1 smoke] PASS suite=${result.suiteId} pathFingerprint=${result.pathFingerprint}\n`,
    );
    process.exit(0);
  } finally {
    await app.close();
  }
}

bootstrap().catch((e) => {
  console.error(e);
  process.exit(1);
});
