import {
  buildHallucinationAuditSampleRowsZh,
  extractDecisionLogTripContext,
  formatHallucinationInputsZh,
  formatHallucinationOutputsZh,
} from '../../utils/decision-log-user-facing.zh.util';
import type { OrchestratorState } from '../../interfaces/trip-plan.interface';
import type { HallucinationPhaseHost, RunHallucinationPhaseParams } from './hallucination-phase.host';

/**
 * HALLUCINATION_DETECTION 执行体：终期 narration 语义一致性离线审计。
 */
export async function runHallucinationPhase(
  host: HallucinationPhaseHost,
  params: RunHallucinationPhaseParams,
): Promise<void> {
  const { context, state } = params;

  if (!host.hallucinationDetection) {
    host.logger.debug(`[Claude Orchestrator] HallucinationDetectionService 未注入，跳过防幻觉检测`);
    return;
  }

  const stepStartTime = Date.now();
  host.logger.debug(`[Claude Orchestrator] 执行 HALLUCINATION_DETECTION 步骤...`);

  try {
    if (!state.narration) {
      state.metadata.last_updated_at = new Date().toISOString();
      return;
    }

    const detectionResult = await host.hallucinationDetection.detectHallucinations(
      state.narration,
      context,
    );

    if (detectionResult.cleanedOutput) {
      state.narration = detectionResult.cleanedOutput as OrchestratorState['narration'];
    }

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
        message: detectionResult.userNotification.message,
        items: detectionResult.hallucinationRisks.map((r) => ({
          text: r.text,
          confidence: r.confidence,
          action: r.action,
        })),
      });

      host.logger.warn(
        `[Claude Orchestrator] 检测到 ${detectionResult.hallucinationRisks.length} 个幻觉风险`,
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
        hallucination_audit_zh: {
          total_claims: detectionResult.statistics.totalClaims,
          verified_against_evidence: detectionResult.statistics.verifiedClaims,
          risk_marked: detectionResult.statistics.hallucinationRisks,
          removed_or_softened: detectionResult.statistics.removedClaims,
          sample_rows: hallucinationSampleRows,
          user_notification: detectionResult.userNotification?.hasRisks
            ? {
                message: detectionResult.userNotification.message,
                low_confidence_count:
                  detectionResult.userNotification.lowConfidenceItems?.length ?? 0,
              }
            : undefined,
        },
      },
    });

    state.metadata.last_updated_at = new Date().toISOString();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    host.logger.error(`[Claude Orchestrator] HALLUCINATION_DETECTION 步骤失败: ${message}`);
    state.errors.push({
      step: 'HALLUCINATION_DETECTION',
      error_code: 'HALLUCINATION_DETECTION_ERROR',
      message: message || '防幻觉检测失败',
      timestamp: new Date().toISOString(),
    });
  }
}
