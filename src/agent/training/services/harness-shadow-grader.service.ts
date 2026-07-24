import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DecisionTrajectoryV1 } from '../interfaces/decision-trajectory.types';
import type { ShadowGraderSample } from '../interfaces/shadow-deployment.types';
import { ShadowDeploymentRegistryService } from './shadow-deployment-registry.service';
import { VllmClientService } from './vllm-client.service';
import { serializePlannerPrompt } from '../dpo/dpo-preference-extractor.util';
import {
  parseHarnessShadowGraderEnabled,
  parseShadowGraderLogEveryN,
} from '../utils/harness-shadow-grader-mode.util';
import {
  markShadowGraderSchedule,
} from '../utils/shadow-grader-request-mark.util';
import {
  buildShadowGraderObservabilitySlice,
  type ShadowGraderObservabilityV1,
} from '../utils/shadow-grader-observability.util';
import { readShadowGraderScheduleMark } from '../utils/shadow-grader-request-mark.util';
import { isDecisionTrajectoryCaptureEnabled } from '../utils/decision-trajectory-feature.util';
import {
  buildShadowGraderOpsReadiness,
  summarizeShadowRegistrations,
  type ShadowGraderOpsReadinessV1,
  type ShadowGraderRegistrationSummaryV1,
} from '../utils/harness-shadow-grader-ops.util';

/**
 * Harness Shadow Grader：在线流量异步影子评测，不干涉用户可见输出。
 */
@Injectable()
export class HarnessShadowGraderService {
  private readonly logger = new Logger(HarnessShadowGraderService.name);
  private readonly inFlight = new Set<string>();

  constructor(
    private readonly configService: ConfigService,
    private readonly registry: ShadowDeploymentRegistryService,
    @Optional() private readonly vllm?: VllmClientService,
  ) {}

  isEnabled(): boolean {
    return parseHarnessShadowGraderEnabled();
  }

  /** route_and_run observability 回显（读一次性 schedule mark + 聚合指标）。 */
  buildObservabilityForRequest(requestId: string): ShadowGraderObservabilityV1 {
    const active = this.registry.getActiveShadow();
    const version = active?.shadowVersion ?? null;
    const aggregate = version ? this.registry.aggregateMetrics(version) : null;
    let scheduleMark = readShadowGraderScheduleMark(requestId);
    if (
      !scheduleMark &&
      this.isEnabled() &&
      !isDecisionTrajectoryCaptureEnabled()
    ) {
      scheduleMark = {
        scheduled: false,
        skip_reason: 'trajectory_capture_off',
        marked_at: new Date().toISOString(),
      };
    }
    return buildShadowGraderObservabilitySlice({
      requestId,
      scheduleMark,
      activeShadowVersion: version,
      aggregate,
    });
  }

  /**
   * 编排 finalize 后触发（fire-and-forget）。
   */
  scheduleGradeFromTrajectory(
    requestId: string,
    payload: DecisionTrajectoryV1,
    production: {
      outcome: string;
      totalReward: number;
    },
  ): void {
    if (!this.isEnabled()) {
      markShadowGraderSchedule(requestId, { scheduled: false, skip_reason: 'disabled' });
      return;
    }
    const shadow = this.registry.getActiveShadow();
    if (!shadow || shadow.lifecycle !== 'ACTIVE') {
      markShadowGraderSchedule(requestId, { scheduled: false, skip_reason: 'no_active_shadow' });
      return;
    }
    if (this.inFlight.has(requestId)) {
      markShadowGraderSchedule(requestId, { scheduled: false, skip_reason: 'in_flight' });
      return;
    }
    this.inFlight.add(requestId);
    markShadowGraderSchedule(requestId, {
      scheduled: true,
      shadow_version: shadow.shadowVersion,
    });

    void this.gradeFromTrajectory(requestId, payload, production, shadow.shadowVersion)
      .catch((err) => {
        this.logger.warn(
          `[ShadowGrader] grade failed requestId=${requestId}: ${err instanceof Error ? err.message : err}`,
        );
      })
      .finally(() => this.inFlight.delete(requestId));
  }

  async gradeFromTrajectory(
    requestId: string,
    payload: DecisionTrajectoryV1,
    production: { outcome: string; totalReward: number },
    shadowVersion: string,
  ): Promise<ShadowGraderSample | null> {
    const reg = this.registry.getRegistration(shadowVersion);
    if (!reg) return null;

    const productionSafetyPass = production.outcome !== 'CRITICAL_FAIL';
    const productionHadRepair = (payload.orchestration_steps ?? []).some(
      (s) => s.step === 'REPAIR',
    );

    let shadowReward = 0;
    let shadowSafetyPass = false;
    let shadowJsonValid = false;
    let latencyMs: number | undefined;

    if (this.vllm?.isServiceAvailable()) {
      const t0 = Date.now();
      try {
        const prompt = serializePlannerPrompt(payload.input_context);
        const resp = await this.vllm.generateDecision({
          userRequest: prompt,
          loraAdapter: reg.vllmAdapterName,
          temperature: 0.2,
          maxTokens: 2048,
        });
        latencyMs = Date.now() - t0;
        const scored = this.scoreShadowPlannerOutput(resp.content);
        shadowReward = scored.reward;
        shadowSafetyPass = scored.safetyPass;
        shadowJsonValid = scored.jsonValid;
      } catch (err) {
        this.logger.debug(
          `[ShadowGrader] vLLM skip requestId=${requestId}: ${err instanceof Error ? err.message : err}`,
        );
        shadowReward = 0;
        shadowSafetyPass = false;
        shadowJsonValid = false;
      }
    } else {
      shadowReward = this.heuristicShadowReward(payload);
      shadowSafetyPass = !payload.axiom_gate || payload.axiom_gate.gate_result !== 'BLOCK';
      shadowJsonValid = Boolean(payload.plan_gen_draft_itinerary?.days?.length);
    }

    const shadowWins =
      shadowSafetyPass &&
      shadowReward > production.totalReward &&
      (!productionHadRepair || shadowJsonValid);

    const sample: ShadowGraderSample = {
      requestId,
      shadowVersion,
      productionOutcome: production.outcome,
      productionReward: production.totalReward,
      productionSafetyPass,
      productionHadRepair,
      shadowReward,
      shadowSafetyPass,
      shadowJsonValid,
      shadowWins,
      gradedAt: new Date().toISOString(),
      latencyMs,
    };

    this.registry.recordSample(sample);

    const everyN = parseShadowGraderLogEveryN();
    const metrics = this.registry.aggregateMetrics(shadowVersion);
    if (metrics.sampleCount % everyN === 0) {
      this.logger.log(
        `[ShadowGrader] ${shadowVersion} n=${metrics.sampleCount} win_rate=${metrics.shadowWinRate.toFixed(3)} ` +
          `promotion_ready=${metrics.promotionReady}`,
      );
    }

    return sample;
  }

  private scoreShadowPlannerOutput(content: string): {
    reward: number;
    safetyPass: boolean;
    jsonValid: boolean;
  } {
    let jsonValid = false;
    try {
      const trimmed = content.trim();
      const jsonStr = trimmed.startsWith('{')
        ? trimmed
        : trimmed.match(/\{[\s\S]*\}/)?.[0];
      if (jsonStr) {
        const parsed = JSON.parse(jsonStr) as { days?: unknown[] };
        jsonValid = Array.isArray(parsed.days) && parsed.days.length > 0;
      }
    } catch {
      jsonValid = false;
    }

    const safetyPass = !/BLOCK|CRITICAL|violation/i.test(content.slice(0, 500));
    let reward = jsonValid ? 0.65 : 0.2;
    if (safetyPass) reward += 0.25;
    if (content.includes('Plan A') || content.includes('plan')) reward += 0.05;

    return { reward: Math.min(1, reward), safetyPass, jsonValid };
  }

  private heuristicShadowReward(payload: DecisionTrajectoryV1): number {
    const draft = payload.plan_gen_draft_itinerary;
    const final = payload.final_output?.itinerary;
    if (!draft?.days?.length) return 0.3;
    if (final?.days?.length && JSON.stringify(draft) !== JSON.stringify(final)) {
      return 0.55;
    }
    return 0.45;
  }

  /** Admin diagnostics：`GET /api/admin/diagnostics/harness` shadow_grader 段 */
  buildAdminDiagnosticsSnapshot(): {
    enabled: boolean;
    active_shadow_version: string | null;
    in_flight_count: number;
    trajectory_capture_enabled: boolean;
    ops_readiness: ShadowGraderOpsReadinessV1;
    registrations: ShadowGraderRegistrationSummaryV1[];
    aggregate: {
      sampleCount: number;
      shadowWinRate: number;
      promotionReady: boolean;
      promotionBlockers: string[];
      productionSafetyPassRate: number;
      shadowSafetyPassRate: number;
    } | null;
  } {
    const active = this.registry.getActiveShadow();
    const version = active?.shadowVersion ?? null;
    const aggregate = version ? this.registry.aggregateMetrics(version) : null;
    const trajectoryCaptureEnabled = isDecisionTrajectoryCaptureEnabled();
    return {
      enabled: this.isEnabled(),
      active_shadow_version: version,
      in_flight_count: this.inFlight.size,
      trajectory_capture_enabled: trajectoryCaptureEnabled,
      ops_readiness: buildShadowGraderOpsReadiness({
        graderEnabled: this.isEnabled(),
        trajectoryCaptureEnabled,
        activeShadow: active,
      }),
      registrations: summarizeShadowRegistrations(this.registry.listRegistrations()),
      aggregate: aggregate
        ? {
            sampleCount: aggregate.sampleCount,
            shadowWinRate: aggregate.shadowWinRate,
            promotionReady: aggregate.promotionReady,
            promotionBlockers: aggregate.promotionBlockers,
            productionSafetyPassRate: aggregate.productionSafetyPassRate,
            shadowSafetyPassRate: aggregate.shadowSafetyPassRate,
          }
        : null,
    };
  }
}
