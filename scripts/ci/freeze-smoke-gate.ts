#!/usr/bin/env npx tsx
/**
 * Freeze / PR smoke gate: dangling imports + critical route_and_run load suite.
 *
 * Usage: npm run ci:freeze-smoke-gate
 */
import { spawnSync } from 'child_process';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');

function run(cmd: string, args: string[]): number {
  console.log(`[freeze-smoke-gate] $ ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, LLM_USE_MOCK: 'true' },
    shell: false,
  });
  return r.status ?? 1;
}

let code = run('npx', ['tsx', 'scripts/ci/check-dangling-imports.ts']);
if (code !== 0) process.exit(code);

code = run('npx', [
  'jest',
  '--runInBand',
  '--forceExit',
  '--ci',
  'src/agent/utils/memory-shell-trip-id.util.spec.ts',
  'src/agent/utils/route-and-run-trip-id-merge.util.spec.ts',
  'src/agent/agent.controller.ao-p0.contract.spec.ts',
  'src/agent/contracts/claude-exec-route-and-run.contract.spec.ts',
  'src/agent/contracts/route-and-run-options.openapi.freeze.spec.ts',
  'src/agent/orchestration/orchestration-main-chain-protocol.contract.spec.ts',
  'src/agent/orchestration/orchestration-governance-matrix.contract.spec.ts',
  'src/agent/orchestration/plan-verify-loop/plan-verify-loop-repair-guards.spec.ts',
  'src/agent/delivery/types/delivery-verdict.types.spec.ts',
  'src/agent/contracts/actions-commit-idempotency.contract.spec.ts',
  'src/decision-runtime/gateway/contracts/unified-execute-idempotency.contract.spec.ts',
]);
process.exit(code);
