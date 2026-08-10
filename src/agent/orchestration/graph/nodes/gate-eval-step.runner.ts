/**
 * GATE_EVAL fallback step（从 ClaudeOrchestrator.executeGateEvalStep 迁出）。
 */

import type { GateEvalStepHost } from './gate-eval-step.host';
import type { LlmProvider } from '../../../../llm/dto/llm-request.dto';
import type { RouteAndRunRequestDto } from '../../../dto/route-and-run.dto';
import type { AgentContext } from '../../../interfaces/claude-orchestration.interface';
import type {
  GuardianType,
  OrchestratorState,
} from '../../../interfaces/trip-plan.interface';
import { shouldSkipAgentReadinessPackCheck } from '../../../utils/agent-readiness-phase.util';

/**
 * GATE_EVAL 步骤：执行 Should-Exist Gate 决策
 * 降级路径：KERNEL_NATIVE_EXECUTION=false 时由 executePhaseViaKernel 调用
 * 强制：Gate 在 Plan 之前执行
 * @deprecated 优先使用 Kernel.executeGateEval。此降级路径将逐步废弃，见 P3 阶段 D.2
 */
export async function executeGateEvalStep(
  host: GateEvalStepHost,
  request: RouteAndRunRequestDto,
  context: AgentContext,
  state: OrchestratorState,
  _provider: LlmProvider,
): Promise<void> {
  state.current_step = 'GATE_EVAL';
  const stepStartTime = Date.now();

  host.logger.debug(`[Claude Orchestrator] 执行 GATE_EVAL 步骤...`);

  try {
    // ========== 1. 准备度检查（规划阶段跳过 Readiness Pack） ==========
    let readinessCheckResult: any = null;
    let readinessBlockers: any[] = [];
    let readinessMust: any[] = [];
    let rulesNeedingDecision: any[] = [];

    const gateStartStr =
      (state.trip_plan_request as { start_date?: string; date_range?: { start_date?: string } })
        ?.start_date ?? state.trip_plan_request?.date_range?.start_date;
    const gateTripStart = gateStartStr ? new Date(gateStartStr) : undefined;
    const skipReadinessPackInGate = shouldSkipAgentReadinessPackCheck(
      request,
      gateTripStart,
      request.message ?? '',
    );

    if (host.readinessService && state.trip_plan_request && !skipReadinessPackInGate) {
      try {
        const destination = typeof state.trip_plan_request.destination === 'string'
          ? state.trip_plan_request.destination
          : `${state.trip_plan_request.destination.lat},${state.trip_plan_request.destination.lng}`;

        // 构建 TripContext
        const tripContext = host.extractTripContextFromState(state);

        // 提取坐标（如果有）
        const geoLat = typeof state.trip_plan_request.destination === 'object'
          ? state.trip_plan_request.destination.lat
          : undefined;
        const geoLng = typeof state.trip_plan_request.destination === 'object'
          ? state.trip_plan_request.destination.lng
          : undefined;

        // 执行准备度检查
        readinessCheckResult = await host.readinessService.checkFromDestination(
          destination,
          tripContext,
          {
            enhanceWithGeo: !!(geoLat && geoLng),
            geoLat,
            geoLng,
            lang: 'zh', // 默认使用中文
            userMessage:
              typeof state.trip_plan_request?.message === 'string'
                ? state.trip_plan_request.message
                : undefined,
          }
        );

        // 提取 blocker 和 must
        readinessBlockers = readinessCheckResult.findings.flatMap((f: any) => f.blockers || []);
        readinessMust = readinessCheckResult.findings.flatMap((f: any) => f.must || []);

        // 检查是否有需要用户决策的规则
        if (host.userDecisionService) {
          rulesNeedingDecision = [...readinessBlockers, ...readinessMust].filter((item: any) => {
            // 检查是否有 userDecision 且有问题列表
            return item.userDecision?.questions && item.userDecision.questions.length > 0;
          });
        }

        host.logger.debug(
          `[Claude Orchestrator] 准备度检查完成: ` +
          `blockers=${readinessBlockers.length}, ` +
          `must=${readinessMust.length}, ` +
          `需要用户决策=${rulesNeedingDecision.length}`
        );
      } catch (error: any) {
        host.logger.warn(`[Claude Orchestrator] 准备度检查失败: ${error?.message}`, error?.stack);
        // 准备度检查失败不影响 Gate 评估，继续执行
      }
    }

    // ========== 1.5. 护城河扩展：失败风险预测检查 ==========
    if (
      host.failureRiskPredictionService &&
      state.research_data?.failure_risk_prediction &&
      request.route_direction_id
    ) {
      try {
        const failureRiskPrediction = state.research_data.failure_risk_prediction;
        const highRiskDays = failureRiskPrediction.predictions.filter(
          (p: any) => p.riskLevel === 'HIGH',
        );

        if (highRiskDays.length > 0) {
          // 如果有高风险日期，添加到violations
          if (!readinessBlockers) {
            readinessBlockers = [];
          }
          readinessBlockers.push({
            type: 'FAILURE_RISK',
            severity: 'HARD',
            message: {
              zh: `预测到第${highRiskDays.map((d: any) => d.day).join(', ')}天存在高风险，建议调整行程日期`,
              en: `High risk predicted for days ${highRiskDays.map((d: any) => d.day).join(', ')}, consider adjusting dates`,
            },
            evidence: [
              {
                sourceId: `failure_risk_prediction_${Date.now()}`,
                source: 'FailureRiskPredictionService',
              },
            ],
          });

          host.logger.debug(
            `[Claude Orchestrator] 失败风险预测检查: 发现${highRiskDays.length}个高风险日期`,
          );
        }
      } catch (error: any) {
        host.logger.warn(
          `[Claude Orchestrator] 失败风险预测检查失败: ${error?.message}`,
          error?.stack,
        );
        // 失败风险预测检查失败不影响 Gate 评估，继续执行
      }
    }

    // ========== 2. 根据准备度检查结果决定 Gate 结果 ==========
    // 如果有 blocker 且不需要用户决策，直接 BLOCK
    if (readinessBlockers.length > 0 && rulesNeedingDecision.length === 0) {
      state.gate_result = {
        gate_result: 'BLOCK',
        violations: readinessBlockers.map((item: any) => ({
          type: 'SAFETY' as const,
          severity: 'HARD' as const,
          detail: typeof item.message === 'string' ? item.message : item.message.zh || item.message.en || '',
          evidence_refs: item.evidence?.map((e: any) => e.sourceId) || [],
        })),
        required_adjustments: [],
        confidence: 0.9,
        evidence_refs: readinessBlockers.flatMap((item: any) => item.evidence?.map((e: any) => e.sourceId) || []),
      };

      // 生成准备度检查的决策日志条目（按三人格分类）
      if (host.readinessService) {
        const readinessDecisionLogs = host.readinessService.generateDecisionLogEntries(
          readinessCheckResult,
          state.request_id
        );
        state.decision_log.push(...readinessDecisionLogs);
      }

      // 添加汇总日志
      state.decision_log.push({
        request_id: state.request_id,
        step: 'GATE_EVAL',
        actor: 'Gatekeeper',
        inputs_summary: '评估行程可行性（准备度检查）',
        outputs_summary: `Gate 结果: BLOCK（准备度检查发现 ${readinessBlockers.length} 个阻塞项）`,
        evidence_refs: state.gate_result.evidence_refs || [],
        timestamp: new Date().toISOString(),
        metadata: {
          duration_ms: Date.now() - stepStartTime,
          readiness_blockers: readinessBlockers,
          guardian: 'ABU' as GuardianType,
        },
      });

      state.metadata.last_updated_at = new Date().toISOString();
      return;
    }

    // 如果有需要用户决策的规则，返回 NEED_USER_CONFIRM
    if (rulesNeedingDecision.length > 0) {
      state.gate_result = {
        gate_result: 'NEED_USER_CONFIRM',
        violations: [],
        required_adjustments: [],
        confidence: 0.8,
        evidence_refs: [],
        readiness_questions: rulesNeedingDecision.map((item: any) => ({
          ruleId: item.id,
          questions: item.userDecision.questions,
          category: item.category,
          severity: item.severity,
        })),
      };

      // 生成准备度检查的决策日志条目（按三人格分类）
      if (readinessCheckResult) {
        if (host.readinessService) {
          const readinessDecisionLogs = host.readinessService.generateDecisionLogEntries(
            readinessCheckResult,
            state.request_id
          );
          state.decision_log.push(...readinessDecisionLogs);
        }
      }

      // 添加用户决策汇总日志
      state.decision_log.push({
        request_id: state.request_id,
        step: 'GATE_EVAL',
        actor: 'Gatekeeper',
        inputs_summary: '评估行程可行性（准备度检查）',
        outputs_summary: `Gate 结果: NEED_USER_CONFIRM（需要用户回答 ${rulesNeedingDecision.length} 个规则的问题）`,
        evidence_refs: [],
        timestamp: new Date().toISOString(),
        metadata: {
          duration_ms: Date.now() - stepStartTime,
          readiness_questions: rulesNeedingDecision.map((item: any) => ({
            ruleId: item.id,
            questionCount: item.userDecision.questions.length,
            category: item.category,
          })),
          guardian: 'ABU' as GuardianType,
        },
      });

      state.metadata.last_updated_at = new Date().toISOString();
      return;
    }

    // ========== 3. 调用 Gatekeeper Agent 执行其他 Gate 评估 ==========
    if (host.gatekeeperAgent && state.trip_plan_request) {
      const gateResult = await host.gatekeeperAgent.evaluateGate(
        state.trip_plan_request,
        state.research_data || {},
        state,
      );

      // 合并准备度检查的 must 项到 required_adjustments
      if (readinessMust.length > 0) {
        gateResult.required_adjustments = [
          ...gateResult.required_adjustments,
          ...readinessMust.map((item: any) => ({
            action: 'REPLACE_SEGMENT' as const, // 默认操作，实际应该根据规则类型调整
            why: typeof item.message === 'string' ? item.message : item.message.zh || item.message.en || '',
            alternatives: [],
          })),
        ];

        // 如果有 must 项，确保 gate_result 是 ADJUST_REQUIRED
        if (gateResult.gate_result === 'ALLOW' && readinessMust.length > 0) {
          gateResult.gate_result = 'ADJUST_REQUIRED';
        }
      }

      state.gate_result = gateResult;
    } else {
      // 降级：使用默认 GateResult
      state.gate_result = {
        gate_result: readinessMust.length > 0 ? 'ADJUST_REQUIRED' : 'ALLOW',
        violations: [],
        required_adjustments: readinessMust.map((item: any) => ({
          action: 'REPLACE_SEGMENT' as const,
          why: typeof item.message === 'string' ? item.message : item.message.zh || item.message.en || '',
          alternatives: [],
        })),
        confidence: 0.8,
        evidence_refs: [],
      };
    }

    // ========== 4. 记录决策日志（包含准备度检查信息） ==========
    // 生成准备度检查的决策日志条目（按三人格分类）
    if (readinessCheckResult && host.readinessService) {
      const readinessDecisionLogs = host.readinessService.generateDecisionLogEntries(
        readinessCheckResult,
        state.request_id
      );
      state.decision_log.push(...readinessDecisionLogs);
    }

    const readinessSummary = readinessCheckResult
      ? `准备度: blockers=${readinessBlockers.length}, must=${readinessMust.length}`
      : '';

    state.decision_log.push({
      request_id: state.request_id,
      step: 'GATE_EVAL',
      actor: 'Gatekeeper',
      inputs_summary: `评估行程可行性${readinessSummary ? `（${readinessSummary}）` : ''}`,
      outputs_summary: `Gate 结果: ${state.gate_result.gate_result}, 置信度: ${state.gate_result.confidence}, 违规数: ${state.gate_result.violations.length}`,
      evidence_refs: state.gate_result.evidence_refs || [],
      timestamp: new Date().toISOString(),
      metadata: {
        duration_ms: Date.now() - stepStartTime,
        violations: state.gate_result.violations,
        adjustments: state.gate_result.required_adjustments,
        guardian: 'ABU' as GuardianType, // 三人格映射（Gatekeeper → Abu）
        readiness_check: readinessCheckResult
          ? {
              totalBlockers: readinessCheckResult.summary.totalBlockers,
              totalMust: readinessCheckResult.summary.totalMust,
              totalShould: readinessCheckResult.summary.totalShould,
              totalOptional: readinessCheckResult.summary.totalOptional,
            }
          : undefined,
      },
    });

    state.metadata.last_updated_at = new Date().toISOString();

    // P0: 生成 Decision Step（Decision-First Engine 集成）
    await host.generateDecisionStepForStep(state, 'GATE_EVAL', 'Gatekeeper');
  } catch (error: any) {
    host.logger.error(`[Claude Orchestrator] GATE_EVAL 步骤失败: ${error?.message}`);
    throw error;
  }
}
