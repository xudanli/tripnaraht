import type { DecisionLedgerSnapshot } from './decision-ledger.types';

/** 注入 token：{@link LedgerWritebackService} 在 Merge 之后消费 */
export const LEDGER_LOGIC_CONSTRAINT_VALIDATORS = Symbol('LEDGER_LOGIC_CONSTRAINT_VALIDATORS');

export interface LedgerLogicConstraintValidationContextV1 {
  ledger: DecisionLedgerSnapshot;
  /** 本轮写回中已合并的 LLM output，按 nodeId 索引（仅含 newDecisions 中出现的 id） */
  mergedOutputs: ReadonlyMap<string, unknown>;
}

/**
 * 领域逻辑验证器：从结构化 output / 节点摘要中抽取规则，产出需 HARD 失效的 seed nodeId。
 * 与结构级联、锚漂移审计正交，保持 Writeback 核心流程通用。
 */
export interface LedgerLogicConstraintValidator {
  readonly name: string;
  validate(ctx: LedgerLogicConstraintValidationContextV1): string[];
}
