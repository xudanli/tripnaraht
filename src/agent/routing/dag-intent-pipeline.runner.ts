/**
 * Dynamic DAG 上游管线（从 ClaudeOrchestrator 迁出）：
 * Triage / analyzeIntent / decideRouting / selectSkills / planExecution。
 */

import type { LlmProvider } from '../../llm/dto/llm-request.dto';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type {
  AgentContext,
  ExecutionPlan,
  ExecutionStep,
  IntentAnalysis,
  RoutingDecision,
  SkillsPlan,
} from '../interfaces/claude-orchestration.interface';
import type {
  OrchestrationStep,
  SubAgentType,
} from '../interfaces/trip-plan.interface';
import {
  ORCHESTRATION_TRIAGE_JSON_SCHEMA,
  buildDestinationSupplementForTriage,
  buildOrchestrationTriagePrompt,
  normalizeOrchestrationTriageResult,
} from '../utils/orchestration-triage.util';

import type { DagIntentPipelineHost } from './dag-intent-pipeline.host';

const ROUTING_DECISION_ROUTES: RoutingDecision['route'][] = [
  'SYSTEM1_API',
  'SYSTEM1_RAG',
  'SYSTEM2_REASONING',
  'SYSTEM2_ANALYSIS',
  'SYSTEM2_WEBBROWSE',
];

export function getDefaultRoutingDecision(reasoning: string): RoutingDecision {
  return {
    route: 'SYSTEM2_REASONING',
    confidence: 0.5,
    reasoning,
    budget: {
      max_seconds: 60,
      max_steps: 8,
      max_browser_steps: 0,
    },
  };
}

/** LLM/mock 可能返回 {} 或缺字段；必须与 RoutingDecision 对齐，否则下游 .route.startsWith 会崩 */
export function normalizeRoutingDecision(parsed: unknown): RoutingDecision | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const p = parsed as Record<string, unknown>;
  const route = p.route;
  if (
    typeof route !== 'string' ||
    !ROUTING_DECISION_ROUTES.includes(route as RoutingDecision['route'])
  ) {
    return null;
  }
  const confidenceRaw = p.confidence;
  const confidence =
    typeof confidenceRaw === 'number' && !Number.isNaN(confidenceRaw)
      ? Math.min(1, Math.max(0, confidenceRaw))
      : 0.5;
  const reasoning =
    typeof p.reasoning === 'string' && p.reasoning.trim().length > 0
      ? p.reasoning
      : '模型未返回 reasoning';
  const b = p.budget;
  let budget: RoutingDecision['budget'] = {
    max_seconds: 60,
    max_steps: 8,
    max_browser_steps: 0,
  };
  if (b && typeof b === 'object') {
    const bb = b as Record<string, unknown>;
    budget = {
      max_seconds: typeof bb.max_seconds === 'number' ? bb.max_seconds : 60,
      max_steps: typeof bb.max_steps === 'number' ? bb.max_steps : 8,
      max_browser_steps:
        typeof bb.max_browser_steps === 'number' ? bb.max_browser_steps : 0,
    };
  }
  const out: RoutingDecision = {
    route: route as RoutingDecision['route'],
    confidence,
    reasoning,
    budget,
  };
  if (Array.isArray(p.requiredCapabilities)) {
    out.requiredCapabilities = p.requiredCapabilities.filter(
      (x) => typeof x === 'string',
    ) as string[];
  }
  if (typeof p.consentRequired === 'boolean') out.consentRequired = p.consentRequired;
  if (typeof p.selected_path === 'string') out.selected_path = p.selected_path;
  return out;
}

/** 从 LLM 响应中提取 JSON（处理可能包含 markdown 代码块或解释性文本的情况） */
export function extractJSONFromResponse(
  response: string,
  logger?: Pick<DagIntentPipelineHost['logger'], 'error'>,
): any {
  if (!response || typeof response !== 'string') {
    throw new Error('响应为空或格式不正确');
  }

  let cleaned = response.trim();

  cleaned = cleaned.replace(/^```(?:json|JSON)?\s*\n?/i, '');
  cleaned = cleaned.replace(/\n?\s*```$/i, '');
  cleaned = cleaned.trim();

  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    cleaned = jsonMatch[0];
  }

  cleaned = cleaned.trim();

  try {
    return JSON.parse(cleaned);
  } catch (parseError: any) {
    logger?.error(
      `JSON 解析失败，原始响应（前500字符）: ${response.substring(0, 500)}`,
    );
    logger?.error(
      `清理后的内容（前500字符）: ${cleaned.substring(0, 500)}`,
    );
    throw parseError;
  }
}

export function generateFallbackPlan(skillsPlan: SkillsPlan): ExecutionPlan {
  const steps: ExecutionStep[] = skillsPlan.selectedSkills.map((skill, index) => ({
    id: `step${index + 1}`,
    type: 'skill',
    skillName: skill.skillName,
    dependencies: skill.dependencies || [],
    parallel: false,
    input: skill.input,
    fallback: {
      onError: 'continue',
      retryCount: 1,
    },
  }));

  return {
    steps,
    parallelGroups: [],
    fallbackStrategy: {
      onError: 'continue',
      retryCount: 1,
    },
  };
}

export async function runOrchestrationTriage(
  host: DagIntentPipelineHost,
  request: RouteAndRunRequestDto,
  context: AgentContext,
  provider: LlmProvider,
  emergencyConstraints?: RouteAndRunRequestDto['emergency_constraints'],
): Promise<{
  intentAnalysis: IntentAnalysis;
  routingDecision: RoutingDecision;
  skillsPlan: SkillsPlan;
} | null> {
  const availableSkills = host.getAvailableSkills(emergencyConstraints);
  const destinationSupplement = buildDestinationSupplementForTriage(
    request.message ?? '',
    request.trip_id ?? undefined,
  );
  const prompt = buildOrchestrationTriagePrompt({
    userMessage: request.message ?? '',
    userId: context.userId,
    tripId: context.tripId ?? undefined,
    conversationHistory: context.conversationHistory,
    availableSkills,
    destinationSupplement,
  });
  const tokenContext = request.request_id
    ? {
        request_id: request.request_id,
        state_machine_step: 'INTAKE' as OrchestrationStep,
        sub_agent: 'Orchestrator' as SubAgentType,
      }
    : undefined;
  try {
    const response = await host.callLlmWithFallback(
      provider,
      prompt,
      ORCHESTRATION_TRIAGE_JSON_SCHEMA as unknown as Record<string, unknown>,
      '编排分流',
      tokenContext,
    );
    const parsed = extractJSONFromResponse(response, host.logger);
    return normalizeOrchestrationTriageResult(parsed);
  } catch (e: unknown) {
    host.logger.warn(
      `[Claude Orchestrator] runOrchestrationTriage 失败: ${e instanceof Error ? e.message : String(e)}`,
    );
    return null;
  }
}

export async function runAnalyzeIntent(
  host: DagIntentPipelineHost,
  request: RouteAndRunRequestDto,
  context: AgentContext,
  provider: LlmProvider,
): Promise<IntentAnalysis> {
  const prompt = host.buildIntentAnalysisPrompt(request, context);

  const tokenContext = request?.request_id
    ? {
        request_id: request.request_id,
        state_machine_step: 'INTAKE' as OrchestrationStep,
        sub_agent: 'Planner' as SubAgentType,
      }
    : undefined;
  try {
    const response = await host.callLlmWithFallback(
      provider,
      prompt,
      {
        type: 'object',
        properties: {
          intentType: {
            type: 'string',
            enum: ['simple_query', 'complex_planning', 'analysis', 'decision', 'mixed'],
          },
          complexity: {
            type: 'string',
            enum: ['simple', 'medium', 'complex'],
          },
          requiredCapabilities: {
            type: 'array',
            items: { type: 'string' },
          },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          reasoning: { type: 'string' },
          keywords: {
            type: 'array',
            items: { type: 'string' },
          },
          entities: { type: 'object' },
        },
        required: ['intentType', 'complexity', 'requiredCapabilities', 'confidence', 'reasoning'],
      },
      '意图分析',
      tokenContext,
    );

    const parsed = extractJSONFromResponse(response, host.logger);
    return parsed as IntentAnalysis;
  } catch (error: any) {
    host.logger.warn(
      `[Claude Orchestrator] 意图分析失败，使用默认值: ${error?.message}`,
    );
    return {
      intentType: 'simple_query',
      complexity: 'simple',
      requiredCapabilities: ['data_query'],
      confidence: 0.5,
      reasoning: '意图分析失败，使用默认值',
    };
  }
}

export async function runDecideRouting(
  host: DagIntentPipelineHost,
  intentAnalysis: IntentAnalysis,
  provider: LlmProvider,
  requestId?: string,
): Promise<RoutingDecision> {
  const prompt = host.buildRoutingPrompt(intentAnalysis);
  const tokenContext = requestId
    ? {
        request_id: requestId,
        state_machine_step: 'INTAKE' as OrchestrationStep,
        sub_agent: 'Orchestrator' as SubAgentType,
      }
    : undefined;
  try {
    const response = await host.callLlmWithFallback(
      provider,
      prompt,
      {
        type: 'object',
        properties: {
          route: {
            type: 'string',
            enum: [
              'SYSTEM1_API',
              'SYSTEM1_RAG',
              'SYSTEM2_REASONING',
              'SYSTEM2_ANALYSIS',
              'SYSTEM2_WEBBROWSE',
            ],
          },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          reasoning: { type: 'string' },
          budget: {
            type: 'object',
            properties: {
              max_seconds: { type: 'number' },
              max_steps: { type: 'number' },
              max_browser_steps: { type: 'number' },
            },
            required: ['max_seconds', 'max_steps', 'max_browser_steps'],
          },
          requiredCapabilities: {
            type: 'array',
            items: { type: 'string' },
          },
          consentRequired: { type: 'boolean' },
          selected_path: {
            type: 'string',
            enum: ['FAST', 'DEEP'],
            description:
              'Optional UX label: FAST≈System1 shallow path, DEEP≈System2 reasoning',
          },
        },
        required: ['route', 'confidence', 'reasoning', 'budget'],
      },
      '路由决策',
      tokenContext,
    );

    const parsed = extractJSONFromResponse(response, host.logger);
    const normalized = normalizeRoutingDecision(parsed);
    if (normalized) return normalized;
    host.logger.warn(
      `[Claude Orchestrator] 路由决策 JSON 无效或缺 route（常见于 LLM 超时后 mock 返回空对象），使用默认 System2`,
    );
    return getDefaultRoutingDecision('路由决策返回无效或空，使用默认值');
  } catch (error: any) {
    host.logger.warn(
      `[Claude Orchestrator] 路由决策失败，使用默认值: ${error?.message}`,
    );
    return getDefaultRoutingDecision('路由决策失败，使用默认值');
  }
}

export async function runSelectSkills(
  host: DagIntentPipelineHost,
  intentAnalysis: IntentAnalysis,
  routingDecision: RoutingDecision,
  context: AgentContext,
  provider: LlmProvider,
  requestId?: string,
  emergencyConstraints?: RouteAndRunRequestDto['emergency_constraints'],
): Promise<SkillsPlan> {
  void context;
  const availableSkills = host.getAvailableSkills(emergencyConstraints);

  if (availableSkills.length === 0) {
    host.logger.warn('[Claude Orchestrator] 没有可用的 Skills');
    return {
      selectedSkills: [],
      executionOrder: [],
      dependencies: {},
    };
  }

  const prompt = host.buildSkillsSelectionPrompt(
    intentAnalysis,
    routingDecision,
    availableSkills,
  );
  const tokenContext = requestId
    ? {
        request_id: requestId,
        state_machine_step: 'RESEARCH' as OrchestrationStep,
        sub_agent: 'Planner' as SubAgentType,
      }
    : undefined;
  try {
    const response = await host.callLlmWithFallback(
      provider,
      prompt,
      {
        type: 'object',
        properties: {
          selectedSkills: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                skillName: { type: 'string' },
                reason: { type: 'string' },
                priority: { type: 'number' },
                input: { type: 'object' },
                dependencies: {
                  type: 'array',
                  items: { type: 'string' },
                },
              },
              required: ['skillName', 'reason', 'priority', 'input'],
            },
          },
          executionOrder: {
            type: 'array',
            items: { type: 'string' },
          },
          dependencies: { type: 'object' },
        },
        required: ['selectedSkills', 'executionOrder', 'dependencies'],
      },
      'Skills 选择',
      tokenContext,
    );

    const parsed = extractJSONFromResponse(response, host.logger);
    return parsed as SkillsPlan;
  } catch (error: any) {
    host.logger.warn(`[Claude Orchestrator] Skills 选择失败: ${error?.message}`);
    return {
      selectedSkills: [],
      executionOrder: [],
      dependencies: {},
    };
  }
}

export async function runPlanExecution(
  host: DagIntentPipelineHost,
  skillsPlan: SkillsPlan,
  routingDecision: RoutingDecision,
  provider: LlmProvider,
  requestId?: string,
): Promise<ExecutionPlan> {
  if (skillsPlan.selectedSkills.length === 0) {
    return {
      steps: [],
      parallelGroups: [],
      fallbackStrategy: {
        onError: 'continue',
        retryCount: 1,
      },
    };
  }

  const prompt = host.buildExecutionPlanningPrompt(skillsPlan, routingDecision);
  const tokenContext = requestId
    ? {
        request_id: requestId,
        state_machine_step: 'RESEARCH' as OrchestrationStep,
        sub_agent: 'Planner' as SubAgentType,
      }
    : undefined;
  try {
    const response = await host.callLlmWithFallback(
      provider,
      prompt,
      {
        type: 'object',
        properties: {
          steps: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                type: {
                  type: 'string',
                  enum: ['skill', 'action', 'parallel_group'],
                },
                skillName: { type: 'string' },
                actionName: { type: 'string' },
                dependencies: {
                  type: 'array',
                  items: { type: 'string' },
                },
                parallel: { type: 'boolean' },
                input: { type: 'object' },
                fallback: {
                  type: 'object',
                  properties: {
                    onError: {
                      type: 'string',
                      enum: ['continue', 'stop', 'retry'],
                    },
                    retryCount: { type: 'number' },
                  },
                },
              },
              required: ['id', 'type', 'dependencies', 'parallel'],
            },
          },
          parallelGroups: {
            type: 'array',
            items: {
              type: 'array',
              items: { type: 'string' },
            },
          },
          fallbackStrategy: {
            type: 'object',
            properties: {
              onError: {
                type: 'string',
                enum: ['continue', 'stop'],
              },
              retryCount: { type: 'number' },
            },
            required: ['onError', 'retryCount'],
          },
          estimatedDuration: { type: 'number' },
          estimatedCost: { type: 'number' },
        },
        required: ['steps', 'parallelGroups', 'fallbackStrategy'],
      },
      '执行计划编排',
      tokenContext,
    );

    const parsed = extractJSONFromResponse(response, host.logger);
    return parsed as ExecutionPlan;
  } catch (error: any) {
    host.logger.warn(
      `[Claude Orchestrator] 执行计划编排失败: ${error?.message}`,
    );
    return generateFallbackPlan(skillsPlan);
  }
}
