/**
 * Phase 2：Decision Readiness 发出的唯一 ASK_USER / BLOCK 短路结果。
 */

import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { OrchestrationResult } from '../interfaces/claude-orchestration.interface';
import type {
  OrchestrationStep,
  SubAgentType,
} from '../interfaces/trip-plan.interface';
import type { DecisionStateShadowV1 } from '../decision-state/decision-state.types';
import {
  formatReadinessAskQuestions,
  type ActivityDecisionTakeover,
} from '../decision-state/activity-decision-takeover.util';
import { serializeActivityDecisionShadow } from '../decision-state/activity-decision-shadow.util';
import {
  assertAskUserAuditAllowsEgress,
  buildAskUserAudit,
} from '../decision-state/ask-user-audit.util';

export function buildDecisionReadinessAskUserResult(input: {
  request: RouteAndRunRequestDto;
  shadow: DecisionStateShadowV1;
  takeover: Extract<
    ActivityDecisionTakeover,
    { kind: 'ASK_FROM_READINESS' | 'BLOCK_FROM_READINESS' }
  >;
  startTime: number;
}): OrchestrationResult {
  const { request, shadow, takeover, startTime } = input;
  const isBlock = takeover.kind === 'BLOCK_FROM_READINESS';
  const askKeys =
    takeover.kind === 'ASK_FROM_READINESS'
      ? takeover.askKeys
      : takeover.readiness.blockingKeys;
  const questions = formatReadinessAskQuestions(askKeys);
  const warnings = takeover.readiness.warningsZh ?? [];

  /** INV-01：ASK 必须带完整审计，否则禁止以 ASK 出站（降级 BLOCK） */
  let askAudit =
    !isBlock && shadow.contract && takeover.readiness.nextAction === 'ASK_USER'
      ? buildAskUserAudit({
          contract: shadow.contract,
          projection: shadow.projection,
          readiness: takeover.readiness,
          questionZh: questions[0] ?? '',
        })
      : null;
  if (askAudit && !assertAskUserAuditAllowsEgress(askAudit)) {
    return {
      success: false,
      status: 'BLOCKED',
      technicalSuccess: true,
      userTaskCompleted: false,
      result: {
        needsUserConfirmation: false,
        clarificationMessage:
          '决策层拒绝发出不完整追问（AskUserAudit incomplete）。请完善决策状态后重试。',
        decisionAskUserAudit: askAudit,
        decisionStateShadow: serializeActivityDecisionShadow(shadow),
      },
      answerText:
        '决策层拒绝发出不完整追问（AskUserAudit incomplete）。请完善决策状态后重试。',
      stepsExecuted: [],
      totalDuration: Date.now() - startTime,
      decisionLog: [
        {
          request_id: request.request_id,
          step: 'INTAKE' as OrchestrationStep,
          actor: 'Orchestrator' as SubAgentType,
          inputs_summary: `用户请求: ${request.message}`,
          outputs_summary: `ASK_BLOCKED_INCOMPLETE_AUDIT: ${(askAudit.incomplete_reasons ?? []).join(',')}`,
          evidence_refs: [],
          timestamp: new Date().toISOString(),
          metadata: { decision_ask_user_audit: askAudit },
        },
      ],
    };
  }

  const header = isBlock
    ? `当前无法继续该决策（${shadow.classified.decisionClass}）：`
    : `继续前还需要补充决策所需信息（${shadow.classified.decisionClass}）：`;
  const clarificationMessage =
    `${header}\n\n` +
    (questions.length ? `${questions.map((q) => `- ${q}`).join('\n')}\n\n` : '') +
    (warnings.length ? `说明：\n${warnings.map((w) => `- ${w}`).join('\n')}\n\n` : '') +
    `（Decision Readiness · ${takeover.readiness.reasonCode}；CRE/ROR 不再并行追问）`;

  const shadowObs = serializeActivityDecisionShadow(shadow);

  return {
    success: false,
    status: isBlock ? 'BLOCKED' : 'NEED_USER_INPUT',
    technicalSuccess: true,
    userTaskCompleted: false,
    result: {
      needsUserConfirmation: !isBlock,
      clarificationMessage,
      missingParams: askKeys,
      decisionStateShadow: shadowObs,
      ...(askAudit ? { decisionAskUserAudit: askAudit } : {}),
      decisionReadinessTakeover: {
        kind: takeover.kind,
        reason: takeover.reason,
        ask_keys: askKeys,
      },
      solutions: questions,
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
        outputs_summary: `DecisionReadiness ${takeover.kind}: ${askKeys.join(',') || takeover.reason}`,
        evidence_refs: [],
        timestamp: new Date().toISOString(),
        metadata: {
          decision_state_contract_shadow: shadowObs,
          ...(askAudit ? { decision_ask_user_audit: askAudit } : {}),
          decision_readiness_takeover: {
            kind: takeover.kind,
            reason: takeover.reason,
            ask_keys: askKeys,
          },
        },
      },
    ],
  };
}
