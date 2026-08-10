/**
 * 编排终态模型：区分技术成功 / 用户任务完成 / 业务状态。
 * `success` 仍保留作兼容字段，新代码优先读 status。
 */

export type OrchestrationStatus =
  | 'DONE'
  | 'NEED_USER_INPUT'
  | 'NEED_USER_CONFIRM'
  | 'BLOCKED'
  | 'NO_FEASIBLE_PATH'
  | 'DELEGATED'
  | 'DEGRADED'
  | 'FAILED';

export type OrchestrationOutcomeFields = {
  /** @deprecated 兼容字段：澄清时为 false；委派时亦为 false（勿再当作「已完成用户任务」） */
  success: boolean;
  status: OrchestrationStatus;
  technicalSuccess: boolean;
  userTaskCompleted: boolean;
  delegateTo?: string;
};

export function finalizeOrchestrationOutcome(input: {
  status: OrchestrationStatus;
  technicalSuccess?: boolean;
  userTaskCompleted?: boolean;
  delegateTo?: string;
}): OrchestrationOutcomeFields {
  const technicalSuccess = input.technicalSuccess ?? input.status !== 'FAILED';
  const userTaskCompleted =
    input.userTaskCompleted ?? input.status === 'DONE';
  // 兼容：仅 DONE 视为 success=true；DELEGATED/澄清/阻断均为 false
  const success = input.status === 'DONE';
  return {
    success,
    status: input.status,
    technicalSuccess,
    userTaskCompleted,
    ...(input.delegateTo ? { delegateTo: input.delegateTo } : {}),
  };
}

/** AgentService / Assembler：是否应继续执行 System1Executor */
export function shouldExecuteSystem1Delegation(result: {
  status?: OrchestrationStatus | string;
  success?: boolean;
  /** 宽松：兼容 OrchestrationResult.result 索引签名 */
  result?: Record<string, unknown> | null;
  answerText?: string;
}): boolean {
  if (result.status === 'DELEGATED') return true;
  // 兼容旧返回：success + SYSTEM1 路由 + 占位文案
  const payload = result.result ?? undefined;
  const routingDecision = payload?.routingDecision as { route?: string } | undefined;
  const route =
    routingDecision?.route ??
    (typeof payload?.route === 'string' ? payload.route : undefined);
  if (!route?.startsWith('SYSTEM1')) return false;
  // 上方已处理 DELEGATED；此处有其它明确 status 则不再走兼容委派
  if (result.status) return false;
  return (
    result.success === true &&
    (result.answerText === '正在处理您的请求...' || !result.answerText)
  );
}
