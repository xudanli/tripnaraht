// src/agent/contracts/execution-system-governance-kernel.ts
/**
 * 执行系统治理内核（v1）：对 **已分类** 的变更报告给出 allow / reject / require_revision。
 * 不做 git diff、不访问 runtime；供 CI / 编排层在 merge 前调用。
 * @see execution-system-governance-kernel.md · semantic-validation-contract.md §27
 */
export type GovernanceVerdictV1 = 'allow' | 'reject' | 'require_revision';

/**
 * 变更报告：由调用方（脚本/评审）填入；内核仅做确定性策略。
 */
export type GovernanceMutationReportV1 = Readonly<{
  /** 人类可读标签，如 PR 标题或 ticket id */
  label?: string;
  /** 是否触碰语义宪法：等价定义、normalize 投影、canonical 形状、§25 分层语义等 */
  touchesSemanticConstitution: boolean;
  /** 是否触碰执行政策：router、upgrade、fallback、memory 绑定规则等 */
  touchesExecutionPolicy: boolean;
  /** 是否触碰变更控制：schema bump、fingerprint material、contract revision、migration */
  touchesMutationControl: boolean;
  /** 是否已在本次变更中 bump `SEMANTIC_VALIDATION_CONTRACT_REVISION` 或等价的契约版本锚点 */
  contractRevisionBumped: boolean;
}>;

export const ExecutionSystemGovernanceKernel = {
  /**
   * 确定性裁决：
   * - 触碰宪法且未 bump → reject
   * - 触碰政策或变更控制且未 bump → require_revision
   * - 其余 → allow
   */
  adjudicateV1(report: GovernanceMutationReportV1): GovernanceVerdictV1 {
    if (report.touchesSemanticConstitution && !report.contractRevisionBumped) return 'reject';
    if ((report.touchesExecutionPolicy || report.touchesMutationControl) && !report.contractRevisionBumped) {
      return 'require_revision';
    }
    return 'allow';
  },
};
