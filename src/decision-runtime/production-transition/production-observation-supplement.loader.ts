/**
 * Loads supplemental observation inputs from local artifacts (CI / ops export).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  ProductionObservationMetricsOverlay,
  ProductionObservationSupplement,
} from './production-observation-supplement.types';
import { resolveEffectivePlanWriteChainStatus } from '../execution/effective-plan-write-chain-status.util';
import { isConstraintGatewayPlanVerifyProjectionEnabled } from '../constraints/constraint-plan-verify.config';

function readJson<T>(filePath: string): T | undefined {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return undefined;
  }
}

export function loadProductionObservationSupplement(
  root = process.cwd(),
): ProductionObservationSupplement {
  const metricsPath =
    process.env.PRODUCTION_OBSERVATION_METRICS_PATH?.trim() ??
    path.join(root, 'artifacts/production-observation/production-metrics.json');

  const metricsOverlay = readJson<ProductionObservationMetricsOverlay>(metricsPath);
  const architectureLint = readJson<{
    pass?: boolean;
    executorBypassCount?: number;
    legacyBooleanCallerCount?: number;
    generatedAt?: string;
  }>(path.join(root, 'artifacts/p5-architecture-lint/report.json'));

  const fallbackDrill = readJson<{ pass?: boolean }>(
    path.join(root, 'artifacts/p4-legacy-fallback-drill/report.json'),
  );

  const supplement: ProductionObservationSupplement = {};

  if (metricsOverlay) {
    supplement.metricsOverlay = metricsOverlay;
  }
  if (architectureLint && typeof architectureLint.pass === 'boolean') {
    supplement.architectureLint = {
      pass: architectureLint.pass,
      executorBypassCount: architectureLint.executorBypassCount ?? 0,
      legacyBooleanCallerCount: architectureLint.legacyBooleanCallerCount ?? 0,
      generatedAt: architectureLint.generatedAt,
    };
    const writeChain = resolveEffectivePlanWriteChainStatus();
    supplement.writeChainStatus = {
      writeChainEnabled: writeChain.writeChainEnabled,
      phase6LegacyDeprecation: writeChain.phase6LegacyDeprecation,
      gatewayDomainRulesExclusive: writeChain.gatewayDomainRulesExclusive,
      constraintPlanVerifyProjection: isConstraintGatewayPlanVerifyProjectionEnabled(),
      agentItineraryPendingCount:
        (architectureLint as { agentItineraryPendingCount?: number }).agentItineraryPendingCount ??
        0,
    };
  }
  if (typeof fallbackDrill?.pass === 'boolean') {
    supplement.legacyFallbackDrillPass = fallbackDrill.pass;
  }

  return supplement;
}
