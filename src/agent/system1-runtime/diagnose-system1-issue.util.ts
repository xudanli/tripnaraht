/**
 * System1 Issue Diagnosis V1：从 Turn Trace 字段做确定性归因，供 Replay / Closed。
 */

import type { System1Issue, System1TurnTrace } from './system1-runtime.types';

export function diagnoseSystem1Issues(trace: Pick<
  System1TurnTrace,
  | 'taskFrame'
  | 'authority'
  | 'requiredEvidence'
  | 'retrievedEvidence'
  | 'sufficiency'
  | 'claims'
  | 'groundingResult'
  | 'routeDecision'
  | 'finalAnswer'
>): System1Issue[] {
  const issues: System1Issue[] = [];

  if (!trace.authority.allowed && trace.authority.changeProposal?.applied !== false) {
    issues.push({
      code: 'AUTHORITY_ERROR',
      messageZh: 'System1 执行了不允许的写动作',
    });
  }
  if (!trace.taskFrame.questionType) {
    issues.push({
      code: 'TASK_FRAME_ERROR',
      messageZh: 'TaskFrame 缺少 questionType',
    });
  }
  if (trace.requiredEvidence.length === 0 && trace.taskFrame.requestedAction !== 'WRITE') {
    issues.push({
      code: 'CONTEXT_REQUIREMENT_ERROR',
      messageZh: '未声明 Required Evidence 却进入回答',
      details: { questionType: trace.taskFrame.questionType },
    });
  }
  if (
    trace.sufficiency &&
    (trace.sufficiency.status === 'INSUFFICIENT' || trace.sufficiency.status === 'PARTIAL') &&
    trace.routeDecision.answerMode === 'STRONG'
  ) {
    issues.push({
      code: 'EVIDENCE_FAILURE',
      messageZh: '证据不足却输出强结论',
      details: { sufficiency: trace.sufficiency.status },
    });
  }
  if (trace.sufficiency?.status === 'CONFLICTED' && trace.routeDecision.recommendedRoute === 'SYSTEM1_ANSWER') {
    issues.push({
      code: 'WORLD_STATE_FAILURE',
      messageZh: '冲突证据仍由 System1 作答',
    });
  }
  const ungrounded = trace.groundingResult.filter((g) => g.status === 'UNGROUNDED');
  if (ungrounded.length && /高风风险较低|一定可以|保证/.test(trace.finalAnswer)) {
    issues.push({
      code: 'GENERATION_ERROR',
      messageZh: '未接地 Claim 进入了最终文本',
      details: { ungrounded: ungrounded.map((g) => g.claimId) },
    });
  }
  const unavailable = trace.retrievedEvidence.filter((e) => e.status === 'UNAVAILABLE');
  if (unavailable.length && trace.requiredEvidence.some((s) => s.key === unavailable[0]?.key && s.required)) {
    issues.push({
      code: 'RETRIEVAL_FAILURE',
      messageZh: 'Required Evidence 未能取回',
      details: { keys: unavailable.map((e) => e.key) },
    });
  }
  return issues;
}
