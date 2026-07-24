/**
 * Gate for E1 benchmark integration tests (real DB + fake HTTP).
 */

import { PrismaClient } from '@prisma/client';
import { createBenchmarkTestHarness, ensureBenchmarkSchema, type BenchmarkTestHarness } from './benchmark-test.harness';

export interface BenchmarkIntegrationContext {
  ready: boolean;
  skipReason?: string;
  harness?: BenchmarkTestHarness;
}

export async function setupBenchmarkIntegration(input?: {
  leaseMs?: number;
  sleepFn?: (ms: number) => Promise<void>;
}): Promise<BenchmarkIntegrationContext> {
  if (process.env.BENCHMARK_INTEGRATION_TEST !== '1') {
    return { ready: false, skipReason: 'Set BENCHMARK_INTEGRATION_TEST=1 to run' };
  }

  const prisma = new PrismaClient();
  const schemaReady = await ensureBenchmarkSchema(prisma);
  await prisma.$disconnect();

  if (!schemaReady) {
    return {
      ready: false,
      skipReason: 'Deploy migration 20260701170000_benchmark_batch_runner before running fault-injection tests',
    };
  }

  const harness = await createBenchmarkTestHarness(input);
  return { ready: true, harness };
}

export function assertIntegrationReady(
  ctx: BenchmarkIntegrationContext,
): asserts ctx is BenchmarkIntegrationContext & { ready: true; harness: BenchmarkTestHarness } {
  if (!ctx.ready) {
    throw new Error(
      `Benchmark integration not ready: ${ctx.skipReason ?? 'unknown'} — tests must FAIL, not skip`,
    );
  }
}

/** @deprecated Use assertIntegrationReady — vacuous pass guard */
export function skipUnlessReady(ctx: BenchmarkIntegrationContext): boolean {
  if (!ctx.ready) {
    assertIntegrationReady(ctx);
  }
  return false;
}
