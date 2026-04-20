#!/usr/bin/env npx ts-node
/**
 * 对指定 tripId 跑一遍「效用算法」体检（不经 HTTP、无需 JWT）：
 * 1) NegotiateContextLoader.loadPlanAndWorld
 * 2) ObjectiveFunctionService.evaluate — 确定性 8 维 + 加权总效用
 * 3) ProbabilisticWorldModel.fromDeterministicModel + ExpectedUtilityService.computeExpectedUtility — MC 期望效用
 *
 * 用法：
 *   DISABLE_REDIS=true npx ts-node --transpile-only scripts/test-risk-assessment-trip.ts <tripUuid>
 *   SAMPLE_SIZE=800 SEED=42 ...
 */

import { NestFactory } from '@nestjs/core';
import { OptimizationModule } from '../src/trips/decision/optimization/optimization.module';
import { NegotiateContextLoaderService } from '../src/trips/decision/optimization/collaboration/negotiate-context-loader.service';
import { ProbabilisticWorldModelService } from '../src/trips/decision/optimization/probabilistic/probabilistic-world-model.service';
import { ExpectedUtilityService } from '../src/trips/decision/optimization/probabilistic/expected-utility.service';
import { ObjectiveFunctionService } from '../src/trips/decision/optimization/objective-function.service';

function safe(n: number): number {
  return typeof n === 'number' && !Number.isNaN(n) ? n : 0;
}

async function main(): Promise<void> {
  const tripId = (process.argv[2] || process.env.TRIP_ID || '').trim();
  if (!tripId) {
    console.error('Usage: npx ts-node scripts/test-risk-assessment-trip.ts <tripUuid>');
    process.exit(1);
  }
  const sampleSize = Number(process.env.SAMPLE_SIZE || '800') || 800;
  const seedRaw = process.env.SEED;
  const seed = seedRaw !== undefined && seedRaw !== '' ? Number(seedRaw) : 42;

  const app = await NestFactory.createApplicationContext(OptimizationModule, {
    logger: ['error', 'warn'],
  });
  try {
    const loader = app.get(NegotiateContextLoaderService);
    const probabilisticWorldModel = app.get(ProbabilisticWorldModelService);
    const expectedUtility = app.get(ExpectedUtilityService);
    const objectiveFunction = app.get(ObjectiveFunctionService);

    const { plan, world } = await loader.loadPlanAndWorld(tripId);
    const totalKm = plan.segments.reduce((s, seg) => s + (seg.distanceKm || 0), 0);

    console.log(
      JSON.stringify(
        {
          tripId,
          planSummary: {
            segmentCount: plan.segments.length,
            totalKmHaversine: Number(totalKm.toFixed(3)),
            perDayKm: plan.segments.map((s) => Number((s.distanceKm || 0).toFixed(3))),
          },
          sampleSize,
          seed: Number.isFinite(seed) ? seed : 42,
        },
        null,
        2,
      ),
    );

    if (!world.physical || !world.human || !world.routeDirection) {
      console.error('Incomplete world model', {
        hasPhysical: !!world.physical,
        hasHuman: !!world.human,
        hasRouteDirection: !!world.routeDirection,
      });
      process.exit(1);
    }

    const det = objectiveFunction.evaluate(plan, world);
    console.log(
      JSON.stringify(
        {
          deterministic: {
            totalUtility: safe(det.totalUtility),
            isFeasible: det.isFeasible,
            breakdown: det.breakdown,
            weightedScores: det.weightedScores,
            weights: objectiveFunction.weights,
            constraintSummary: {
              hardViolationCount: det.constraints.hardViolations.length,
              softViolationCount: det.constraints.softViolations.length,
              overallSatisfaction: det.constraints.overallSatisfaction,
            },
          },
        },
        null,
        2,
      ),
    );

    const probabilisticContext = probabilisticWorldModel.fromDeterministicModel(world);
    const result = expectedUtility.computeExpectedUtility(plan, probabilisticContext, objectiveFunction.weights, {
      sampleSize,
      seed: Number.isFinite(seed) ? seed : 42,
      deterministicWorld: world,
    });

    console.log(
      JSON.stringify(
        {
          expectedUtility: safe(result.expectedUtility),
          feasibilityProbability: safe(result.feasibilityProbability),
          confidenceInterval: {
            lower: safe(result.confidenceInterval?.lower),
            upper: safe(result.confidenceInterval?.upper),
            level: result.confidenceInterval?.level ?? 0.95,
          },
          downsideRisk: safe(result.riskMetrics?.downRiskProbability),
          dimensionExpectations: result.dimensionExpectations,
          riskMetrics: result.riskMetrics,
          samplingDetails: result.samplingDetails,
        },
        null,
        2,
      ),
    );
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
