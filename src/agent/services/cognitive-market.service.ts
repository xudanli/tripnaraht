import { Injectable, Logger, Optional } from '@nestjs/common';
import type { ExecutionTrace } from '../contracts/execution-trace.types';
import type { CognitiveArtifactType } from '../contracts/cognitive-artifact.types';
import {
  computeArtifactUtilityScore,
  depreciateUtilityScore,
  reinforceUtilityScore,
} from '../utils/cognitive-market.util';
import { CognitiveAssetRegistryService } from './cognitive-asset-registry.service';
import { PolicyAgentPopulationService } from './policy-agent-population.service';

/**
 * Cognitive Market Layer — transfer, pricing shocks, and trace-driven asset mutation hooks (CEL).
 */
@Injectable()
export class CognitiveMarketService {
  private readonly logger = new Logger(CognitiveMarketService.name);

  constructor(
    private readonly registry: CognitiveAssetRegistryService,
    @Optional() private readonly population?: PolicyAgentPopulationService,
  ) {}

  /**
   * Policy B imports a cognitive asset from the registry into its portfolio (borrow, not necessarily exclusive move).
   */
  importAssetToPolicy(params: {
    artifactId: string;
    targetPolicyId: string;
    fromPolicyId?: string;
    utilityDelta?: number;
  }): void {
    const a = this.registry.get(params.artifactId);
    if (!a) throw new Error(`COGNITIVE_ARTIFACT_UNKNOWN:${params.artifactId}`);

    this.registry.recordBorrow(params.artifactId, params.targetPolicyId);
    if (params.utilityDelta != null && params.utilityDelta !== 0) {
      this.registry.patchUtility(
        params.artifactId,
        reinforceUtilityScore(a.utilityScore, params.utilityDelta * 0.05),
      );
    }

    this.registry.appendTransfer({
      artifactId: params.artifactId,
      fromPolicyId: params.fromPolicyId ?? a.sourcePolicyId,
      toPolicyId: params.targetPolicyId,
      transferredAt: Date.now(),
      utilityDelta: params.utilityDelta,
    });

    this.population?.linkCognitiveArtifacts(params.targetPolicyId, [params.artifactId]);
  }

  /** Failure-driven correction — anomalies hit asset price (bounded). */
  applyAnomalyShock(artifactId: string, normalizedSeverity: number): void {
    const a = this.registry.get(artifactId);
    if (!a) return;
    const next = depreciateUtilityScore(a.utilityScore, {
      usageDecay: 0,
      anomalyPenalty: 0.12 * Math.min(1, normalizedSeverity),
    });
    this.registry.patchUtility(artifactId, next);
  }

  /** Idle / low reuse — gradual decay. */
  applyUsageDepreciation(artifactId: string, decay: number): void {
    const a = this.registry.get(artifactId);
    if (!a) return;
    const next = depreciateUtilityScore(a.utilityScore, {
      usageDecay: decay,
      anomalyPenalty: 0,
    });
    this.registry.patchUtility(artifactId, next);
  }

  /**
   * ETK-driven mutation (v1): synthesize `tool_sequence` assets from TOOL_CALL steps; pricing from trace health.
   */
  ingestExecutionTracesForAssets(params: {
    traces: ExecutionTrace[];
    sourcePolicyId?: string;
  }): string[] {
    const ids: string[] = [];
    for (const tr of params.traces) {
      const toolSteps = tr.steps.filter((s) => s.type === 'TOOL_CALL');
      if (toolSteps.length === 0) continue;

      const names = toolSteps
        .map((s) => (s.metadata?.toolName ? String(s.metadata.toolName) : 'unknown'))
        .filter(Boolean);
      const successRate = tr.anomalies?.length ? 0.75 : 0.95;
      const reuseRate = tr.decision.mode === 'REUSE' ? 0.9 : 0.5;
      const anomalyReduction = tr.anomalies?.length ? 0.4 : 0.85;
      const utility = computeArtifactUtilityScore({ successRate, reuseRate, anomalyReduction });

      const prov = {
        ...tr.provenance,
        generatedAt: tr.provenance?.generatedAt ?? tr.timestamp,
      };

      const id = this.registry.register({
        type: 'tool_sequence' as CognitiveArtifactType,
        value: { tools: names, traceId: tr.traceId, artifactContextId: tr.artifactId },
        provenance: prov,
        utilityScore: utility,
        sourcePolicyId: params.sourcePolicyId,
      });
      ids.push(id);
    }
    this.logger.debug(`CEL: minted ${ids.length} cognitive asset(s) from traces`);
    return ids;
  }

  summarizeBrokerState(): {
    artifactCount: number;
    recentTransfers: number;
  } {
    return {
      artifactCount: this.registry.listAll().length,
      recentTransfers: this.registry.recentTransfers(10).length,
    };
  }
}
