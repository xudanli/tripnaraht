/**
 * P1 — rich execution status read model for Decision Center polling.
 */

import type {
  DecisionApplyResultSummary,
  DecisionExecutionStatus,
  DecisionExecutionStatusResponse,
  DecisionRecord,
  OutcomeValidationVerdict,
} from '../types/decision-semantics.types';
import { resolveDecisionExecutionStatus } from './decision-execution-status.util';

const STATUS_EXPLANATION: Record<DecisionExecutionStatus, string> = {
  RECORDED: '决策已记录，尚未应用到行程。',
  APPLYING: '正在应用修复到行程…',
  APPLIED: '修复已写入行程，等待可行性重检完成。',
  RECOMPUTING: 'Decision Ledger 或可行性基线已更新，预测可能过期。',
  RESOLVED: '决策效果已验证，问题应已解决。',
  PARTIALLY_RESOLVED: '部分指标符合预期，仍建议关注后续验证。',
  FAILED: '决策应用或验证失败。',
  ROLLED_BACK: '决策已回滚。',
  PARTIALLY_APPLIED: '行程已部分更新，路线重算未完成，需继续修复。',
  IDEMPOTENT_REPLAY: '重复提交已幂等处理，未再次执行修复。',
};

export function buildDecisionExecutionStatusResponse(input: {
  record: DecisionRecord;
  applyResult?: DecisionApplyResultSummary;
  validationVerdict?: OutcomeValidationVerdict;
}): DecisionExecutionStatusResponse {
  const { record, applyResult, validationVerdict } = input;

  if (record.recordKind === 'IDEMPOTENT_REPLAY_AUDIT') {
    return {
      decisionId: record.id,
      tripId: record.tripId,
      problemId: record.problemId,
      selectedOptionId: record.selectedOptionId,
      status: 'IDEMPOTENT_REPLAY',
      recordStatus: record.status,
      validationStatus: record.validationStatus,
      decidedAt: record.decidedAt,
      tripVersionBefore: record.tripVersionBefore,
      tripVersionAfter: record.tripVersionAfter,
      applyResult,
      explanation: STATUS_EXPLANATION.IDEMPOTENT_REPLAY,
      validationVerdict,
      effectiveDecisionId: record.effectiveDecisionId,
      postApplyCoherence: record.postApplyCoherence,
      needsRepair: record.needsRepair,
      generatedAt: new Date().toISOString(),
    };
  }

  const status = resolveDecisionExecutionStatus({ record, applyResult });
  let explanation = STATUS_EXPLANATION[status] ?? STATUS_EXPLANATION.RECORDED;

  if (applyResult?.message && status === 'APPLIED') {
    explanation = `${explanation} ${applyResult.message}`;
  }
  if (validationVerdict === 'REFUTED') {
    explanation = '观测与预测不符，建议重新评估方案。';
  }

  return {
    decisionId: record.id,
    tripId: record.tripId,
    problemId: record.problemId,
    selectedOptionId: record.selectedOptionId,
    status,
    recordStatus: record.status,
    validationStatus: record.validationStatus,
    decidedAt: record.decidedAt,
    tripVersionBefore: record.tripVersionBefore,
    tripVersionAfter: record.tripVersionAfter,
    applyResult,
    explanation,
    validationVerdict: validationVerdict ?? record.lastOutcomeValidation?.verdict,
    repairCommandApplied: record.actualMutation?.operations?.length
      ? record.actualMutation.operations.length > 0
      : undefined,
    postApplyCoherence: record.postApplyCoherence,
    needsRepair: record.needsRepair,
    generatedAt: new Date().toISOString(),
  };
}
