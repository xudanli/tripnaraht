/**
 * DYNAMIC_DAG 路径实现体（从 ClaudeOrchestrator.orchestrate 迁出）。
 */

import {
  setLlmTraceRoutePath,
} from '../../llm/token-context.storage';
import {
  LlmProvider,
} from '../../llm/dto/llm-request.dto';
import {
  IntentAnalysis,
  RoutingDecision,
  SkillsPlan,
  OrchestrationResult,
  AgentContext,
} from '../interfaces/claude-orchestration.interface';
import {
  normalizeExecutionPlanCoalesceVerifyRepair,
  normalizeSkillsPlanCoalesceVerifyRepair,
} from '../services/claude-orchestrator-smart-update-normalize.util';
import {
  isOrchestrationTriageEnabled,
} from '../utils/orchestration-triage.util';
import {
  RouteAndRunRequestDto,
} from '../dto/route-and-run.dto';
import {
  finalizeOrchestrationOutcome,
} from '../utils/orchestration-outcome.util';
import {
  OrchestrationStep,
  SubAgentType,
} from '../interfaces/trip-plan.interface';

import type { DynamicDagHost } from './dynamic-dag.host';

/**
 * DYNAMIC_DAG 路径：Triage / Intent→Route→Skills → executePlan。
 */
export async function runDynamicDagPath(
  host: DynamicDagHost,
  request: RouteAndRunRequestDto,
  context: AgentContext,
  deadline: { remainingMs: () => number; clamp: (ms: number, minMs?: number) => number } | undefined,
  llmProvider: LlmProvider,
  startTime: number,
): Promise<OrchestrationResult> {
      setLlmTraceRoutePath('CLAUDE_DYNAMIC');

      let intentAnalysis: IntentAnalysis | undefined;
      let routingDecision: RoutingDecision | undefined;
      let skillsPlan: SkillsPlan | undefined;

      if (isOrchestrationTriageEnabled()) {
        host.logger.debug(`[Claude Orchestrator] 步骤 1–4/6: 编排分流（Intent+Route+Skills 合并）...`);
        const triage = await host.runOrchestrationTriage(
          request,
          context,
          llmProvider,
          request.emergency_constraints,
        );
        if (triage) {
          intentAnalysis = triage.intentAnalysis;
          routingDecision = triage.routingDecision;
          skillsPlan = triage.skillsPlan;
          host.logger.log(
            `[Claude Orchestrator] ✅ Triage: ${intentAnalysis.intentType} → ${routingDecision.route}, skills=${skillsPlan.selectedSkills.length}`,
          );
        } else {
          host.logger.warn('[Claude Orchestrator] Triage 失败，回退分步 Intent→Route→Skills');
        }
      }

      if (!intentAnalysis) {
        host.logger.debug(`[Claude Orchestrator] 步骤 1/6: 分析用户意图...`);
        intentAnalysis = await host.analyzeIntent(request, context, llmProvider);
        host.logger.log(
          `[Claude Orchestrator] ✅ 意图分析完成: ${intentAnalysis.intentType}, 复杂度: ${intentAnalysis.complexity}`,
        );
      }

      if (!routingDecision) {
        host.logger.debug(`[Claude Orchestrator] 步骤 2/6: 选择路由策略...`);
        routingDecision = await host.decideRouting(intentAnalysis, llmProvider, request.request_id);
        host.logger.log(
          `[Claude Orchestrator] ✅ 路由决策完成: ${routingDecision.route}, 置信度: ${routingDecision.confidence}`,
        );
      }

      // 3. 根据路由决策选择执行路径
      if (routingDecision.route?.startsWith('SYSTEM1')) {
        // System 1：显式委派给 AgentService → System1Executor，勿伪装成已完成用户任务
        const outcome = finalizeOrchestrationOutcome({
          status: 'DELEGATED',
          technicalSuccess: true,
          userTaskCompleted: false,
          delegateTo: 'AGENT_SERVICE_SYSTEM1',
        });
        return {
          ...outcome,
          result: {
            route: routingDecision.route,
            routingDecision,
            intentAnalysis,
            delegated: true,
            delegateTo: 'AGENT_SERVICE_SYSTEM1',
          },
          answerText: '',
          stepsExecuted: [],
          totalDuration: Date.now() - startTime,
          decisionLog: [
            {
              request_id: request.request_id,
              step: 'INTAKE' as OrchestrationStep,
              actor: 'Orchestrator' as SubAgentType,
              inputs_summary: `用户请求: ${request.message}`,
              outputs_summary: `意图类型: ${intentAnalysis.intentType}, 复杂度: ${intentAnalysis.complexity}`,
              evidence_refs: [],
              timestamp: new Date().toISOString(),
              metadata: { orchestration_status: 'DELEGATED' },
            },
            {
              request_id: request.request_id,
              step: 'INTAKE' as OrchestrationStep,
              actor: 'Orchestrator' as SubAgentType,
              inputs_summary: `意图分析结果: ${intentAnalysis.intentType}`,
              outputs_summary: `路由决策: ${routingDecision.route} → DELEGATED:AGENT_SERVICE_SYSTEM1`,
              evidence_refs: [],
              timestamp: new Date().toISOString(),
              metadata: {
                orchestration_status: 'DELEGATED',
                delegateTo: 'AGENT_SERVICE_SYSTEM1',
              },
            },
          ],
        };
      }


      // 4. System 2 路径：使用 LLM 选择 Skills
      if (!skillsPlan) {
        host.logger.debug(`[Claude Orchestrator] 步骤 4/6: 选择 Skills...`);
        skillsPlan = await host.selectSkills(
          intentAnalysis,
          routingDecision,
          context,
          llmProvider,
          request.request_id,
          request.emergency_constraints,
        );
      } else {
        host.logger.debug(
          `[Claude Orchestrator] 步骤 4/6: Skills 已由 Triage 预选 (${skillsPlan.selectedSkills.length})`,
        );
      }
      host.logger.log(`[Claude Orchestrator] ✅ Skills 选择完成: ${skillsPlan.selectedSkills.length} 个 Skills`);
      if (skillsPlan.selectedSkills.length > 0) {
        host.logger.debug(`[Claude Orchestrator] 选择的 Skills: ${skillsPlan.selectedSkills.map(s => s.skillName).join(', ')}`);
      }

      // 4.5. 提前验证 Skills 输入参数（在 plan 编排之前，节省 LLM 成本）
      host.logger.debug(`[Claude Orchestrator] 步骤 4.5/6: 提前验证 Skills 输入参数...`);
      
      // 特殊处理：创建新行程场景（trip_id 为 null）
      // 如果选择了需要 world/tripId 的 skills，应该先构建 world 上下文
      const isCreatingNewTrip = !(request.trip_id || context.tripId || '').trim();
      if (isCreatingNewTrip) {
        const needsWorldOrTripId = skillsPlan.selectedSkills.some(skill => {
          if (!skill.skillName) return false;
          const skillMeta = host.skillsRegistry?.getSkill(skill.skillName)?.metadata;
          if (!skillMeta?.inputSchema) return false;
          
          // 检查是否需要 world 或 tripId
          const schema = skillMeta.inputSchema as {
            dependencies?: Array<{ param?: string; alternatives?: string[] }>;
          };
          const needsWorld = schema.dependencies?.some(
            (dep) => dep.param === 'world' || dep.alternatives?.includes('world'),
          );
          const needsTripId = schema.dependencies?.some(
            (dep) => dep.param === 'tripId' || dep.alternatives?.includes('tripId'),
          );
          
          return needsWorld || needsTripId;
        });
        
        if (needsWorldOrTripId) {
          // 检查是否可以从消息中提取 countryCode（用于构建 world）
          const countryCode = host.extractCountryCodeFromMessage(request.message);
          if (!countryCode) {
            host.logger.warn(`[Claude Orchestrator] 创建新行程需要 world 上下文，但无法从消息中提取 countryCode`);
            return {
              success: false,
              result: {
                needsUserConfirmation: true,
                clarificationMessage: '无法完成行程规划，因为缺少必需的信息。\n\n缺失项：\n- 目的地国家或地区\n\n影响：\n- 无法构建世界模型上下文\n- 无法进行路线方向选择\n- 无法生成可执行的行程规划\n\n请提供更多信息，或联系系统管理员获取帮助。',
                errorType: 'MISSING_REQUIRED_PARAM' as any,
                missingParams: ['countryCode'],
                solutions: [
                  '在消息中明确指定目的地国家或地区（如：日本、东京、Japan）',
                  '提供已保存的行程 ID，系统将自动获取国家代码',
                ],
              },
              answerText: '无法完成行程规划，因为缺少必需的信息。\n\n缺失项：\n- 目的地国家或地区\n\n影响：\n- 无法构建世界模型上下文\n- 无法进行路线方向选择\n- 无法生成可执行的行程规划\n\n请提供更多信息，或联系系统管理员获取帮助。',
              stepsExecuted: [],
              totalDuration: Date.now() - startTime,
              decisionLog: [],
            };
          }
          
          // 如果可以从消息中提取 countryCode，自动添加 world.buildContext 到 skillsPlan
          // 确保后续步骤能够获取 world 上下文
          const hasWorldBuildContext = skillsPlan.selectedSkills.some(s => s.skillName === 'world.buildContext');
          if (!hasWorldBuildContext) {
            host.logger.debug(`[Claude Orchestrator] 创建新行程场景：自动添加 world.buildContext 到 skillsPlan，countryCode: ${countryCode}`);
            skillsPlan.selectedSkills.unshift({
              skillName: 'world.buildContext',
              reason: '创建新行程需要构建 world 上下文',
              priority: 1,
              input: {
                countryCode: countryCode,
              },
              dependencies: [],
            });
            // 更新 executionOrder
            if (!skillsPlan.executionOrder.includes('world.buildContext')) {
              skillsPlan.executionOrder.unshift('world.buildContext');
            }
          }
        }
      }

      // 4.4 仅选 web.browse 且未带 url 时，用用户问题构造搜索页 URL，避免 4.5 校验卡死
      host.injectWebBrowseUrlIfMissing(skillsPlan, request);

      // 4.45 itinerary.verify + repair.apply → itinerary.smart_update（单闭环，降低多轮调度）
      normalizeSkillsPlanCoalesceVerifyRepair(skillsPlan);
      host.logger.debug(
        `[Claude Orchestrator] smart_update 归一化后 Skills: ${skillsPlan.selectedSkills.map((s) => s.skillName).join(', ')}`,
      );
      
      const earlyValidationResult = await host.validateSkillsInputs(skillsPlan, context, request);
      if (!earlyValidationResult.valid) {
        const clarificationMessage =
          earlyValidationResult.clarificationMessage ||
          host.buildMissingParamClarificationMessage({
            message: `缺少必需参数: ${(earlyValidationResult.missingParams ?? []).join(', ') || 'unknown'}`,
            missingParams: earlyValidationResult.missingParams ?? [],
          });
        host.logger.warn(
          `[Claude Orchestrator] Skills 验证失败: ${earlyValidationResult.missingParams?.join(', ')}`,
        );
        return {
          success: false,
          result: {
            needsUserConfirmation: true,
            clarificationMessage,
            errorType: 'MISSING_REQUIRED_PARAM' as any,
            missingParams: earlyValidationResult.missingParams,
            solutions: earlyValidationResult.solutions || [],
          },
          answerText: clarificationMessage,
          stepsExecuted: [],
          totalDuration: Date.now() - startTime,
          decisionLog: [],
        };
      }

      // 5. 使用 LLM 编排执行计划
      host.logger.debug(`[Claude Orchestrator] 步骤 5/6: 编排执行计划...`);
      const executionPlan = await host.planExecution(skillsPlan, routingDecision, llmProvider, request.request_id);
      normalizeExecutionPlanCoalesceVerifyRepair(executionPlan);
      host.logger.log(`[Claude Orchestrator] ✅ 执行计划完成: ${executionPlan.steps.length} 个步骤`);

      // 5.5. 再次验证计划输入参数（处理 plan 编排时可能添加的参数依赖）
      host.logger.debug(`[Claude Orchestrator] 步骤 5.5/6: 验证计划输入参数...`);
      const validationResult = await host.validatePlanInputs(executionPlan, context, request);
      if (!validationResult.valid) {
        const clarificationMessage =
          validationResult.clarificationMessage ||
          host.buildMissingParamClarificationMessage({
            message: `缺少必需参数: ${(validationResult.missingParams ?? []).join(', ') || 'unknown'}`,
            missingParams: validationResult.missingParams ?? [],
          });
        host.logger.warn(`[Claude Orchestrator] 计划验证失败: ${validationResult.missingParams?.join(', ')}`);
        return {
          success: false,
          result: {
            needsUserConfirmation: true,
            clarificationMessage,
            errorType: 'MISSING_REQUIRED_PARAM' as any,
            missingParams: validationResult.missingParams,
            solutions: validationResult.solutions || [],
          },
          answerText: clarificationMessage,
          stepsExecuted: [],
          totalDuration: Date.now() - startTime,
          decisionLog: [],
        };
      }

      // 6. 执行计划
      host.logger.debug(`[Claude Orchestrator] 步骤 6/6: 执行计划...`);
      const intentSnapshot = host.buildSkillInputIntentSnapshot(request, context);
      const result = await host.executePlan(executionPlan, context, request, intentSnapshot);
      host.logger.log(`[Claude Orchestrator] ✅ 执行完成: success=${result.success}, 成功步骤: ${result.stepsExecuted.filter(s => s.success).length}/${result.stepsExecuted.length}`);

      return result;
}
