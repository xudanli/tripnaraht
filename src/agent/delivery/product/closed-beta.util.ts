/**
 * Closed Beta — 以真实完整 Trip 驱动 Incident Review 与 Regression。
 * 除 Beta 阻断 / 数据质量 / 用户理解 / 性能 / 稳定性 / 恢复外，
 * 不新增 Harness / DI / Temporal / Proactive 抽象。
 */

export const CLOSED_BETA_PROGRAM_SCHEMA =
  'nara.v1_closed_beta_program@v1' as const;

export type BetaAllowChangeCategory =
  | 'BETA_BLOCKER'
  | 'DATA_QUALITY'
  | 'USER_UNDERSTANDING'
  | 'PERFORMANCE'
  | 'STABILITY'
  | 'RECOVERY';

export type BetaForbiddenChangeCategory =
  | 'NEW_HARNESS_ABSTRACTION'
  | 'NEW_DI_ABSTRACTION'
  | 'NEW_TEMPORAL_ABSTRACTION'
  | 'NEW_PROACTIVE_ABSTRACTION'
  | 'GLOBAL_PROACTIVE_TRUE'
  | 'AUTO_APPLY'
  | 'AUTO_CANCEL'
  | 'AUTO_REROUTE';

export type ClosedBetaProgramV1 = {
  schemaId: typeof CLOSED_BETA_PROGRAM_SCHEMA;
  version: 1;
  programId: string;
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED';
  allowChangeCategories: BetaAllowChangeCategory[];
  forbiddenChangeCategories: BetaForbiddenChangeCategory[];
  capabilityReadyIsNotProductReady: true;
  architectureFrozen: true;
  reasonsZh: string[];
};

export function startClosedBetaProgram(input?: {
  programId?: string;
}): ClosedBetaProgramV1 {
  return {
    schemaId: CLOSED_BETA_PROGRAM_SCHEMA,
    version: 1,
    programId: input?.programId ?? `beta_v1_${Date.now()}`,
    status: 'ACTIVE',
    allowChangeCategories: [
      'BETA_BLOCKER',
      'DATA_QUALITY',
      'USER_UNDERSTANDING',
      'PERFORMANCE',
      'STABILITY',
      'RECOVERY',
    ],
    forbiddenChangeCategories: [
      'NEW_HARNESS_ABSTRACTION',
      'NEW_DI_ABSTRACTION',
      'NEW_TEMPORAL_ABSTRACTION',
      'NEW_PROACTIVE_ABSTRACTION',
      'GLOBAL_PROACTIVE_TRUE',
      'AUTO_APPLY',
      'AUTO_CANCEL',
      'AUTO_REROUTE',
    ],
    capabilityReadyIsNotProductReady: true,
    architectureFrozen: true,
    reasonsZh: [
      'Closed Beta 启动：以真实完整 Trip 验收用户任务闭环',
      '除阻断/数据质量/理解/性能/稳定/恢复外，不新增智能体架构层',
    ],
  };
}

export type BetaIncidentV1 = {
  incidentId: string;
  tripId: string;
  journeyId?: string;
  category: BetaAllowChangeCategory | 'OTHER';
  summaryZh: string;
  severity: 'P0' | 'P1' | 'P2' | 'P3';
  openedAt: string;
  status: 'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'REGRESSED';
};

export function openBetaIncident(input: {
  tripId: string;
  summaryZh: string;
  category: BetaIncidentV1['category'];
  severity?: BetaIncidentV1['severity'];
  journeyId?: string;
  incidentId?: string;
}): BetaIncidentV1 {
  return {
    incidentId: input.incidentId ?? `inc_${input.tripId}_${Date.now()}`,
    tripId: input.tripId,
    journeyId: input.journeyId,
    category: input.category,
    summaryZh: input.summaryZh,
    severity: input.severity ?? 'P2',
    openedAt: new Date().toISOString(),
    status: 'OPEN',
  };
}

export type BetaChangeRequestV1 = {
  requestId: string;
  category: string;
  allowed: boolean;
  reasonZh: string;
};

/**
 * Beta 变更门禁：架构扩展类一律拒绝。
 */
export function reviewBetaChangeRequest(input: {
  program: ClosedBetaProgramV1;
  category: string;
  requestId?: string;
}): BetaChangeRequestV1 {
  const allowedCats = input.program.allowChangeCategories as string[];
  const forbidden = input.program.forbiddenChangeCategories as string[];
  if (forbidden.includes(input.category)) {
    return {
      requestId: input.requestId ?? `bcr_${Date.now()}`,
      category: input.category,
      allowed: false,
      reasonZh: `禁止：${input.category}（架构冻结 / Auto Action 关闭）`,
    };
  }
  if (!allowedCats.includes(input.category)) {
    return {
      requestId: input.requestId ?? `bcr_${Date.now()}`,
      category: input.category,
      allowed: false,
      reasonZh: `非 Beta 允许类别：${input.category}`,
    };
  }
  return {
    requestId: input.requestId ?? `bcr_${Date.now()}`,
    category: input.category,
    allowed: true,
    reasonZh: `允许：${input.category}（产品化/Beta 阻断修复）`,
  };
}

export type BetaRegressionCaseV1 = {
  caseId: string;
  tripId: string;
  journeyId: string;
  goldenId: string;
  status: 'PASS' | 'FAIL' | 'PENDING';
  noteZh?: string;
};

export function recordBetaRegression(input: {
  tripId: string;
  journeyId: string;
  goldenId: string;
  status: BetaRegressionCaseV1['status'];
  noteZh?: string;
  caseId?: string;
}): BetaRegressionCaseV1 {
  return {
    caseId: input.caseId ?? `reg_${input.goldenId}`,
    tripId: input.tripId,
    journeyId: input.journeyId,
    goldenId: input.goldenId,
    status: input.status,
    noteZh: input.noteZh,
  };
}
