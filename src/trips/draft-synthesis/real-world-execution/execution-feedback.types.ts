/**
 * 外部系统回调：执行结果 → 回流世界状态 / Trace / 学习。
 */
export interface ExecutionFeedback {
  actionId: string;
  outcome: 'SUCCESS' | 'FAILED';
  detail?: string;
  timestamp: number;
  /** 供应商错误码等 */
  externalCode?: string;
}
