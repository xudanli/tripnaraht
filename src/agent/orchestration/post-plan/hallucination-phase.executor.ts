import {
  buildHallucinationAuditSampleRowsZh,
  extractDecisionLogTripContext,
  formatHallucinationInputsZh,
  formatHallucinationOutputsZh,
} from '../../utils/decision-log-user-facing.zh.util';
import type { OrchestratorState } from '../../interfaces/trip-plan.interface';
import type { HallucinationPhaseHost, RunHallucinationPhaseParams } from './hallucination-phase.host';
import {
  evaluateHallucinationDeliveryGate,
  isHallucinationDeliveryBlocking,
  narrationLikelyContainsFacts,
  type HallucinationDeliveryGateV1,
} from './hallucination-delivery-gate.util';

export type HallucinationPhaseOutcome = {
  blocked: boolean;
  gate: HallucinationDeliveryGateV1;
  errorMessage?: string;
};

/**
 * HALLUCINATION_DETECTION 执行体：终期 narration 语义一致性审计 + 交付硬门。
 */
export async function runHallucinationPhase(
  host: HallucinationPhaseHost,
  params: RunHallucinationPhaseParams,
): Promise<HallucinationPhaseOutcome> {
  const { context, state } = params;
  const at = new Date().toISOString();

  if (!host.hallucinationDetection) {
    const hasFacts = narrationLikelyContainsFacts(state.narration);
    const gate: HallucinationDeliveryGateV1 = {
      schemaId: 'tripnara.hallucination_delivery_gate@v1',
      version: 1,
      verdict: hasFacts ? 'detector_missing_with_facts' : 'pass',
      hard_fact_conflicts: [],
      soft_flags: 0,
      at,
    };
    (state.metadata as Record<string, unknown>).hallucination_delivery_gate_v1 = gate;
    if (hasFacts) {
      host.logger.warn(
        `[Claude Orchestrator] HallucinationDetectionService 未注入，且叙述含事实声明 → 阻断 DONE request_id=${state.request_id}`,
      );
      state.errors.push({
        step: 'HALLUCINATION_DETECTION',
        error_code: 'HALLUCINATION_DETECTOR_MISSING',
        message: '防幻觉检测服务未注入，无法校验事实声明',
        timestamp: at,
      });
      return {
        blocked: true,
        gate,
        errorMessage: 'Hallucination detector missing while narration contains factual claims',
      };
    }
    host.logger.debug(`[Claude Orchestrator] HallucinationDetectionService 未注入，无事实声明，跳过`);
    return { blocked: false, gate };
  }

  const stepStartTime = Date.now();
  host.logger.debug(`[Claude Orchestrator] 执行 HALLUCINATION_DETECTION 步骤...`);

  try {
    if (!state.narration) {
      state.metadata.last_updated_at = new Date().toISOString();
      const gate = evaluateHallucinationDeliveryGate(null);
      (state.metadata as Record<string, unknown>).hallucination_delivery_gate_v1 = gate;
      return { blocked: false, gate };
    }

    const detectionResult = await host.hallucinationDetection.detectHallucinations(
      state.narration,
      context,
    );

    if (detectionResult.cleanedOutput) {
      state.narration = detectionResult.cleanedOutput as OrchestratorState['narration'];
    }

    const gate = evaluateHallucinationDeliveryGate(detectionResult);
    (state.metadata as Record<string, unknown>).hallucination_delivery_gate_v1 = gate;

    if (detectionResult.hallucinationRisks.length > 0) {
      if (!state.metadata.warnings) {
        state.metadata.warnings = [];
      }

      (state.metadata.warnings as Array<{
        type: string;
        message: string;
        items: Array<{ text: string; confidence: number; action: string }>;
      }>).push({
        type: 'HALLUCINATION_RISK',
        message: detectionResult.userNotification.message ?? '',
        items: detectionResult.hallucinationRisks.map((r) => ({
          text: r.text,
          confidence: r.confidence,
          action: r.action,
        })),
      });

      host.logger.warn(
        `[Claude Orchestrator] 检测到 ${detectionResult.hallucinationRisks.length} 个幻觉风险 (verdict=${gate.verdict})`,
      );
    }

    const hallucinationDurationMs = Date.now() - stepStartTime;
    const hallucinationSampleRows = buildHallucinationAuditSampleRowsZh({
      verifiedClaims: detectionResult.verifiedClaims,
      riskClaims: detectionResult.hallucinationRisks,
      maxRows: 5,
      excerptMaxLen: 88,
    });

    const tripCtx = extractDecisionLogTripContext({
      tripPlanRequest: state.trip_plan_request,
      metadata: state.metadata as Record<string, unknown>,
      itinerary: state.itinerary,
    });

    state.decision_log.push({
      request_id: state.request_id,
      step: 'HALLUCINATION_DETECTION',
      actor: 'HallucinationDetection',
      inputs_summary: formatHallucinationInputsZh(tripCtx),
      outputs_summary: formatHallucinationOutputsZh(
        detectionResult.statistics.totalClaims,
        detectionResult.statistics.verifiedClaims,
        detectionResult.statistics.hallucinationRisks,
        {
          removedCount: detectionResult.statistics.removedClaims,
          durationMs: hallucinationDurationMs,
          sampleRows: hallucinationSampleRows,
        },
      ),
      evidence_refs: [],
      timestamp: new Date().toISOString(),
      metadata: {
        duration_ms: hallucinationDurationMs,
        statistics: detectionResult.statistics,
        hallucination_delivery_gate_v1: gate,
        hallucination_audit_zh: {
          total_claims: detectionResult.statistics.totalClaims,
          verified_against_evidence: detectionResult.statistics.verifiedClaims,
          risk_marked: detectionResult.statistics.hallucinationRisks,
          removed_or_softened: detectionResult.statistics.removedClaims,
          sample_rows: hallucinationSampleRows,
          user_notification: detectionResult.userNotification?.hasRisks
            ? {
                message: detectionResult.userNotification.message ?? '',
                low_confidence_count:
                  detectionResult.userNotification.lowConfidenceItems?.length ?? 0,
              }
            : undefined,
        },
      },
    });

    state.metadata.last_updated_at = new Date().toISOString();

    if (isHallucinationDeliveryBlocking(gate)) {
      state.errors.push({
        step: 'HALLUCINATION_DETECTION',
        error_code: 'HALLUCINATION_HARD_FACT_CONFLICT',
        message: `硬事实冲突 ${gate.hard_fact_conflicts.length} 项，禁止进入 DONE`,
        timestamp: new Date().toISOString(),
      });
      return {
        blocked: true,
        gate,
        errorMessage: `Hard fact conflicts in narration (${gate.hard_fact_conflicts.length})`,
      };
    }

    return { blocked: false, gate };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    host.logger.error(`[Claude Orchestrator] HALLUCINATION_DETECTION 步骤失败: ${message}`);
    state.errors.push({
      step: 'HALLUCINATION_DETECTION',
      error_code: 'HALLUCINATION_DETECTION_ERROR',
      message: message || '防幻觉检测失败',
      timestamp: new Date().toISOString(),
    });

    const hasFacts = narrationLikelyContainsFacts(state.narration);
    const gate: HallucinationDeliveryGateV1 = {
      schemaId: 'tripnara.hallucination_delivery_gate@v1',
      version: 1,
      verdict: hasFacts ? 'detector_error_with_facts' : 'soft_ok',
      hard_fact_conflicts: [],
      soft_flags: 0,
      at: new Date().toISOString(),
    };
    (state.metadata as Record<string, unknown>).hallucination_delivery_gate_v1 = gate;
    if (hasFacts) {
      return {
        blocked: true,
        gate,
        errorMessage: message || 'Hallucination detection failed with factual narration',
      };
    }
    return { blocked: false, gate };
  }
}
