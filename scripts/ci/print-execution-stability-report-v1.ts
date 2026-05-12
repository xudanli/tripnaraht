#!/usr/bin/env npx tsx
/**
 * CI 单视图结论：`execution_os.verdict@v1`（无运行时决策；jest 已通过时指纹/replay 字段为真）。
 * @see src/agent/runtime/specs/execution-os-stability-contract.v1.md §8
 */
import { buildExecutionOsVerdictV1 } from './execution-os-stability-verdict.lib';

const verdict = buildExecutionOsVerdictV1();
console.log(JSON.stringify(verdict, null, 2));

if (!verdict.governance_match) {
  process.exit(1);
}
