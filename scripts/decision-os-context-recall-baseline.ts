#!/usr/bin/env npx ts-node
/**
 * 上下文召回 baseline（修订 KPI 第二项 · T+3 出 baseline）
 *
 * 运行:
 *   npx ts-node --transpile-only scripts/decision-os-context-recall-baseline.ts
 */

import { runContextRecallBaseline } from '../src/decision/slo/context-recall-baseline.runner';

function main(): void {
  const report = runContextRecallBaseline();
  console.log(JSON.stringify(report, null, 2));
  if (report.recallPct < report.targetPctT6) {
    console.warn(
      `[context-recall] ${report.recallPct}% < T+6 target ${report.targetPctT6}% (delta ${report.deltaVsTargetPct}%)`,
    );
    process.exitCode = 1;
  } else {
    console.log(`[context-recall] OK ${report.recallPct}% (target ${report.targetPctT6}%)`);
  }
}

main();
