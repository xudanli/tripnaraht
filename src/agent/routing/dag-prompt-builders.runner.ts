/**
 * DAG 意图/路由/Skills/执行计划提示词（纯函数，从 ClaudeOrchestrator 迁出）。
 */

import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { AgentContext } from '../interfaces/claude-orchestration.interface';
import type {
  IntentAnalysis,
  RoutingDecision,
  SkillsPlan,
} from '../interfaces/claude-orchestration.interface';
import {
  INTENT_ANALYSIS_PROMPT,
  ROUTING_DECISION_PROMPT,
  SKILLS_SELECTION_PROMPT,
  EXECUTION_PLANNING_PROMPT,
} from '../services/claude-orchestration-prompts';
import { resolveDestinationLlmPromptSupplement } from '../utils/destination-llm-prompt-supplement.util';

export function buildIntentAnalysisPrompt(
  request: RouteAndRunRequestDto,
  context: AgentContext,
): string {
  const destSupplement = resolveDestinationLlmPromptSupplement({
    userMessage: request.message,
    destinationHint: request.message,
  });
  const destBlock = destSupplement ? `\n[目的地特化规则]\n${destSupplement}\n` : '';
  return `
${INTENT_ANALYSIS_PROMPT}

[用户请求]
${request.message}

[上下文信息]
- 用户 ID: ${context.userId}
- 行程 ID: ${context.tripId || '无'}
- 对话历史: ${context.conversationHistory?.join('\n') || '无'}
${destBlock}
请分析用户意图。
`.trim();
}

export function buildRoutingPrompt(intentAnalysis: IntentAnalysis): string {
  return `
${ROUTING_DECISION_PROMPT}

[意图分析结果]
${JSON.stringify(intentAnalysis, null, 2)}

请根据意图分析结果，决定路由策略。
`.trim();
}

export function buildSkillsSelectionPrompt(
  intentAnalysis: IntentAnalysis,
  routingDecision: RoutingDecision,
  availableSkills: Array<{ name: string; description: string }>,
): string {
  const skillsList = availableSkills
    .map((skill) => `- ${skill.name}: ${skill.description}`)
    .join('\n');

  return `
${SKILLS_SELECTION_PROMPT}

[意图分析结果]
${JSON.stringify(intentAnalysis, null, 2)}

[路由决策]
${JSON.stringify(routingDecision, null, 2)}

[可用 Skills]
${skillsList}

请选择最合适的 Skills。
`.trim();
}

export function buildExecutionPlanningPrompt(
  skillsPlan: SkillsPlan,
  routingDecision: RoutingDecision,
): string {
  return `
${EXECUTION_PLANNING_PROMPT}

[Skills 选择结果]
${JSON.stringify(skillsPlan, null, 2)}

[路由决策]
${JSON.stringify(routingDecision, null, 2)}

请编排最优的执行计划。
`.trim();
}
