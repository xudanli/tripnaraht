/**
 * PLAN_GEN / VERIFY / REPAIR fallback steps（从 ClaudeOrchestrator 迁出）。
 */

import type { PlanLoopFallbackStepsHost } from './plan-loop-fallback-steps.host';
import type { LlmProvider } from '../../../../llm/dto/llm-request.dto';
import type { RouteAndRunRequestDto } from '../../../dto/route-and-run.dto';
import type { AgentContext } from '../../../interfaces/claude-orchestration.interface';
import type {
  GuardianType,
  Itinerary,
  OrchestratorState,
  TripPlanRequest,
} from '../../../interfaces/trip-plan.interface';
import { syncPlanRoutingMetricsToTripPlan } from '../../../axioms/plan-routing-metrics.util';
import { applyPostRepairRoutingMetricsSync } from '../../../axioms/post-repair-routing-sync.util';
import { hydrateOpeningHoursEvidenceForItinerary } from '../../../utils/opening-hours-evidence-hydration.util';
import { maybeGuardAdjustmentSmPhaseFromRequest } from '../../../harness/hardening/adjustment-capability-scope.util';

/**
 * PLAN_GEN 步骤：生成结构化行程草案
 * 降级路径：KERNEL_NATIVE_EXECUTION=false 时由 executePhaseViaKernel 调用
 * @deprecated 优先使用 Kernel.executePlanGen。此降级路径将逐步废弃，见 P3 阶段 D.2
 */
export async function executePlanGenStep(
  host: PlanLoopFallbackStepsHost,
  request: RouteAndRunRequestDto,
  context: AgentContext,
  state: OrchestratorState,
  _provider: LlmProvider,
): Promise<void> {
  /** Hardening：ITINERARY_ADJUST 须持有 PLAN Capability；非 Adjust 跳过 */
  maybeGuardAdjustmentSmPhaseFromRequest(request as any, 'PLAN_GEN');
  state.current_step = 'PLAN_GEN';
  const stepStartTime = Date.now();

  host.logger.debug(`[Claude Orchestrator] 执行 PLAN_GEN 步骤...`);

  try {
    // 调用 itinerary.generate Skill 生成行程
    if (host.skillsRegistry && state.trip_plan_request) {
      try {
        const itinerarySkill = host.skillsRegistry.getSkill('itinerary.generate');
        if (itinerarySkill) {
          const intakeRaw = (state.metadata as { intake_user_message?: string })?.intake_user_message;
          const intakeTrim =
            typeof intakeRaw === 'string' && intakeRaw.trim().length > 0 ? intakeRaw.trim() : undefined;
          const requestForSkill =
            intakeTrim != null
              ? ({ ...state.trip_plan_request, intake_user_message: intakeTrim } as TripPlanRequest)
              : state.trip_plan_request;
          const itineraryResult = await itinerarySkill.execute({
            request: requestForSkill,
            research_data: state.research_data,
            gate_result: state.gate_result,
          });
          // 类型转换：Skill 返回的结果需要转换为 Itinerary
          if (itineraryResult && typeof itineraryResult === 'object' && 'request_id' in itineraryResult && 'days' in itineraryResult) {
            state.itinerary = itineraryResult as Itinerary;
            if (state.trip_plan_request && state.itinerary.days?.length) {
              state.trip_plan_request = syncPlanRoutingMetricsToTripPlan(
                state.trip_plan_request,
                state.itinerary,
              );
            }
          } else {
            // 降级：生成空行程
            state.itinerary = {
              request_id: state.request_id,
              days: [],
            };
          }
        } else {
          // 降级：生成空行程
          state.itinerary = {
            request_id: state.request_id,
            days: [],
          };
        }
      } catch (error: any) {
        host.logger.warn(`[Claude Orchestrator] itinerary.generate 失败: ${error?.message}`);
        // 降级：生成空行程
        state.itinerary = {
          request_id: state.request_id,
          days: [],
        };
      }
    } else {
      // 降级：生成空行程
      state.itinerary = {
        request_id: state.request_id,
        days: [],
      };
    }

    state.decision_log.push({
      request_id: state.request_id,
      step: 'PLAN_GEN',
      actor: 'Planner',
      inputs_summary: '生成行程草案',
      outputs_summary: `生成了 ${state.itinerary.days.length} 天的行程`,
      evidence_refs: [],
      timestamp: new Date().toISOString(),
      metadata: {
        duration_ms: Date.now() - stepStartTime,
      },
    });

    state.metadata.last_updated_at = new Date().toISOString();

    // P0: 生成 Decision Step（Decision-First Engine 集成）
    await host.generateDecisionStepForStep(state, 'PLAN_GEN', 'Planner');

    // Iterative Deployment: 收集轨迹（PLAN_GEN 完成后）
    if (host.trajectoryCollection && state.itinerary && state.gate_result) {
      try {
        const context = request as any; // 获取 context
        const tripId = context.trip_id || undefined;
        const countryCode = state.trip_plan_request?.destination 
          ? (typeof state.trip_plan_request.destination === 'string' 
              ? undefined 
              : undefined) // TODO: 从 destination 提取 countryCode
          : undefined;

        // 如果没有 compliance_result，生成一个默认的（从 gate_result 推导）
        let complianceResult = state.compliance_result;
        if (!complianceResult && host.complianceAgent && state.itinerary) {
          try {
            complianceResult = await host.complianceAgent.checkCompliance(
              state.itinerary,
              state.gate_result,
              state,
            );
          } catch (error: any) {
            host.logger.warn(`[Claude Orchestrator] Compliance 检查失败，使用默认值: ${error?.message}`);
            // 使用默认的 compliance result
            complianceResult = {
              risk_warnings: [],
              disclaimers: [],
              required_confirmations: [],
            };
          }
        } else if (!complianceResult) {
          // 如果没有 complianceAgent，使用默认值
          complianceResult = {
            risk_warnings: [],
            disclaimers: [],
            required_confirmations: [],
          };
        }

        await host.trajectoryCollection.collectTrajectory({
          requestId: state.request_id,
          tripId,
          plan: state.itinerary,
          decisionTrace: state.decision_log,
          researchData: state.research_data || {},
          gateResult: state.gate_result,
          complianceResult: complianceResult as any,
          modelVersion: 'v1.0', // TODO: 从配置或上下文获取
          countryCode,
        });
        host.logger.debug(`[Claude Orchestrator] 轨迹已收集: requestId=${state.request_id}`);
      } catch (error: any) {
        // 轨迹收集失败不应该影响主流程
        host.logger.warn(`[Claude Orchestrator] 轨迹收集失败: ${error?.message}`);
      }
    }
  } catch (error: any) {
    host.logger.error(`[Claude Orchestrator] PLAN_GEN 步骤失败: ${error?.message}`);
    throw error;
  }
}

/**
 * VERIFY 步骤：验证开放时间冲突/换乘 buffer/可达性/疲劳阈值
 * 降级路径：KERNEL_NATIVE_EXECUTION=false 时由 executePhaseViaKernel 调用
 * @deprecated 优先使用 Kernel.executeVerify。此降级路径将逐步废弃，见 P3 阶段 D.2
 */
export async function executeVerifyStep(
  host: PlanLoopFallbackStepsHost,
  request: RouteAndRunRequestDto,
  context: AgentContext,
  state: OrchestratorState,
  _provider: LlmProvider,
): Promise<void> {
  maybeGuardAdjustmentSmPhaseFromRequest(request as any, 'VERIFY');
  state.current_step = 'VERIFY';
  const stepStartTime = Date.now();

  host.logger.debug(`[Claude Orchestrator] 执行 VERIFY 步骤...`);

  try {
    const verificationIssues: string[] = [];

    // 调用验证 Skills（itinerary.verify）
    if (host.skillsRegistry && state.itinerary) {
      try {
        const researchData =
          state.research_data && typeof state.research_data === 'object'
            ? ({ ...state.research_data } as Record<string, unknown>)
            : ({} as Record<string, unknown>);
        const ohSkill = host.skillsRegistry.getSkill('opening_hours.get');
        if (ohSkill) {
          try {
            await hydrateOpeningHoursEvidenceForItinerary({
              itinerary: state.itinerary,
              researchData,
              openingHoursSkill: ohSkill as {
                execute: (input: { poi_ids: string[] }) => Promise<{ opening_hours?: unknown[] }>;
              },
            });
            state.research_data = researchData;
          } catch (e: unknown) {
            host.logger.warn(
              `[Claude Orchestrator] VERIFY opening_hours hydrate skipped: ${e instanceof Error ? e.message : String(e)}`,
            );
          }
        }

        const verifySkill = host.skillsRegistry.getSkill('itinerary.verify');
        if (verifySkill) {
          const verifyResult = await verifySkill.execute({
            itinerary: state.itinerary,
            research_data: researchData,
            user_query: request.message,
            intent_hints: (() => {
              const vt = state.trip_plan_request?.constraints?.vehicle_type;
              if (vt === '2WD' || vt === '4WD') return { constraints_vehicle_type: vt };
              return undefined;
            })(),
          });
          
          if (verifyResult?.issues && Array.isArray(verifyResult.issues)) {
            verificationIssues.push(...verifyResult.issues);
          }
        }
      } catch (error: any) {
        host.logger.warn(`[Claude Orchestrator] itinerary.verify 失败: ${error?.message}`);
      }
    }

    // 记录验证结果
    if (verificationIssues.length > 0) {
      state.errors.push({
        step: 'VERIFY',
        error_code: 'VERIFICATION_ISSUES',
        message: `发现 ${verificationIssues.length} 个验证问题`,
        timestamp: new Date().toISOString(),
      });
    }

    state.decision_log.push({
      request_id: state.request_id,
      step: 'VERIFY',
      actor: 'Orchestrator',
      inputs_summary: '验证行程可行性',
      outputs_summary: verificationIssues.length > 0 
        ? `发现 ${verificationIssues.length} 个问题` 
        : '验证通过',
      evidence_refs: [],
      timestamp: new Date().toISOString(),
      metadata: {
        duration_ms: Date.now() - stepStartTime,
        issues: verificationIssues,
        guardian: 'DR_DRE' as GuardianType, // P1 改进：三人格映射（VERIFY → Dr.Dre，节奏与体感验证）
      },
    });

    state.metadata.last_updated_at = new Date().toISOString();

    // P0: 生成 Decision Step（Decision-First Engine 集成）
    await host.generateDecisionStepForStep(state, 'VERIFY', 'CoreDecision');
  } catch (error: any) {
    host.logger.error(`[Claude Orchestrator] VERIFY 步骤失败: ${error?.message}`);
    state.errors.push({
      step: 'VERIFY',
      error_code: 'VERIFICATION_ERROR',
      message: error?.message || '验证失败',
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * REPAIR 步骤：替换POI/改路线/加buffer/换交通/降级
 * 降级路径：KERNEL_NATIVE_EXECUTION=false 时由 executePhaseViaKernel 调用
 * @deprecated 优先使用 Kernel.executeRepair。此降级路径将逐步废弃，见 P3 阶段 D.2
 */
export async function executeRepairStep(
  host: PlanLoopFallbackStepsHost,
  request: RouteAndRunRequestDto,
  context: AgentContext,
  state: OrchestratorState,
  _provider: LlmProvider,
): Promise<void> {
  maybeGuardAdjustmentSmPhaseFromRequest(request as any, 'REPAIR');
  state.current_step = 'REPAIR';
  const stepStartTime = Date.now();

  host.logger.debug(`[Claude Orchestrator] 执行 REPAIR 步骤...`);

  try {
    let repairApplied = false;
    const repairActions: string[] = [];

    // 1. 调用 LocalInsight Agent 生成替代方案
    if (host.localInsightAgent && state.trip_plan_request && state.gate_result) {
      try {
        const alternatives = await host.localInsightAgent.suggestAlternatives(
          state.trip_plan_request,
          state.gate_result,
          state,
        );
        
        if (alternatives.alternative_pois.length > 0 || alternatives.alternative_routes.length > 0) {
          repairApplied = true;
          repairActions.push(`生成了 ${alternatives.alternative_pois.length} 个替代 POI 和 ${alternatives.alternative_routes.length} 条替代路线`);
          state.alternatives = alternatives;
        }
      } catch (error: any) {
        host.logger.warn(`[Claude Orchestrator] LocalInsight Agent 失败: ${error?.message}`);
      }
    }

    // 2. 调用 repair.apply Skill 应用修复
    if (host.skillsRegistry && state.itinerary && state.gate_result) {
      try {
        const repairSkill = host.skillsRegistry.getSkill('repair.apply');
        if (repairSkill && state.gate_result.required_adjustments.length > 0) {
          const repairResult = await repairSkill.execute({
            itinerary: state.itinerary,
            adjustments: state.gate_result.required_adjustments,
            alternatives: state.alternatives,
          });
          
          if (repairResult?.repaired) {
            repairApplied = true;
            repairActions.push('已应用修复方案');
            state.itinerary = repairResult.itinerary;
          }
        }
      } catch (error: any) {
        host.logger.warn(`[Claude Orchestrator] repair.apply 失败: ${error?.message}`);
      }
    }

    if (repairApplied && state.trip_plan_request && state.itinerary?.days?.length) {
      const postRepair = applyPostRepairRoutingMetricsSync({
        trip: state.trip_plan_request,
        itinerary: state.itinerary,
        metadata: state.metadata as Record<string, unknown>,
        message: request?.message ?? state.trip_plan_request.message,
        routeAndRunIntent: (state.metadata as Record<string, unknown>)?.route_and_run_intent as any,
        clarificationAnswers: (state.metadata as Record<string, unknown>)?.clarification_answers as any,
      });
      state.trip_plan_request = postRepair.trip;
    }

    state.decision_log.push({
      request_id: state.request_id,
      step: 'REPAIR',
      actor: 'LocalInsight',
      inputs_summary: '修复行程问题',
      outputs_summary: repairApplied 
        ? repairActions.join('；') 
        : '无需修复或修复失败',
      evidence_refs: [],
      timestamp: new Date().toISOString(),
      metadata: {
        duration_ms: Date.now() - stepStartTime,
        repair_applied: repairApplied,
        guardian: 'NEPTUNE' as GuardianType, // P1 改进：三人格映射（REPAIR → Neptune，空间结构修复）
      },
    });

    state.metadata.last_updated_at = new Date().toISOString();

    // P0: 生成 Decision Step（Decision-First Engine 集成）
    await host.generateDecisionStepForStep(state, 'REPAIR', 'LocalInsight');
  } catch (error: any) {
    host.logger.error(`[Claude Orchestrator] REPAIR 步骤失败: ${error?.message}`);
    state.errors.push({
      step: 'REPAIR',
      error_code: 'REPAIR_ERROR',
      message: error?.message || '修复失败',
      timestamp: new Date().toISOString(),
    });
  }
}
