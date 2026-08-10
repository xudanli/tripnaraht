/**
 * CRE nextAction=ASK_USER 时的澄清短路结果（禁止继续 RESEARCH / 全量 RAG）。
 */

import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { OrchestrationResult } from '../interfaces/claude-orchestration.interface';
import type {
  OrchestrationStep,
  SubAgentType,
} from '../interfaces/trip-plan.interface';
import type { ContextRequirementPlan } from '../context-requirement/context-requirement.types';
import { serializeCrePlanForObservability } from '../context-requirement/context-requirement.service';

export function buildCreAskUserResult(input: {
  request: RouteAndRunRequestDto;
  plan: ContextRequirementPlan;
  startTime: number;
}): OrchestrationResult {
  const { request, plan, startTime } = input;
  const lines =
    plan.userQuestions.length > 0
      ? plan.userQuestions.map((q) => `- ${q}`)
      : plan.blockingGaps.map((g) => `- 还需要确认：${g.labelZh || g.key}`);
  const clarificationMessage =
    `继续前还需要补充一些信息（${plan.operation}）：\n\n` +
    (lines.length ? `${lines.join('\n')}\n\n` : '') +
    `请补充后重试，系统不会在缺口未补齐时进入求解。`;

  return {
    success: false,
    status: 'NEED_USER_INPUT',
    technicalSuccess: true,
    userTaskCompleted: false,
    result: {
      needsUserConfirmation: true,
      clarificationMessage,
      missingParams: plan.blockingGaps.map((g) => g.key),
      contextRequirementPlan: serializeCrePlanForObservability(plan),
      solutions: ['补充上述缺失项后重新发送请求'],
    },
    answerText: clarificationMessage,
    stepsExecuted: [],
    totalDuration: Date.now() - startTime,
    decisionLog: [
      {
        request_id: request.request_id,
        step: 'INTAKE' as OrchestrationStep,
        actor: 'Orchestrator' as SubAgentType,
        inputs_summary: `用户请求: ${request.message}`,
        outputs_summary: `CRE ASK_USER: ${plan.blockingGaps.map((g) => g.key).join(', ') || 'blocking'}`,
        evidence_refs: [],
        timestamp: new Date().toISOString(),
        metadata: {
          context_requirement_plan: serializeCrePlanForObservability(plan),
        },
      },
    ],
  };
}
