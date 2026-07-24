/**
 * 阴影部署（Shadow Grader）— 100% 异步评测，零生产流量干涉。
 */

export type ShadowRoutingStrategy = 'SHADOW_GRADER_ONLY';

export type ShadowAdapterLifecycle =
  | 'REGISTERING'
  | 'ACTIVE'
  | 'PROMOTION_READY'
  | 'PROMOTED'
  | 'RETIRED'
  | 'FAILED';

/** 注册阴影 LoRA（来自 checkpoint-dpo-final） */
export interface RegisterShadowAdapterRequest {
  taskId: string;
  adapterPath: string;
  routingStrategy?: ShadowRoutingStrategy;
  minValidationScore?: number;
  baselineProductionVersion?: string;
  vllmAdapterName?: string;
  baseModelName?: string;
}

export interface ShadowAdapterRegistration {
  shadowVersion: string;
  taskId: string;
  adapterPath: string;
  vllmAdapterName: string;
  routingStrategy: ShadowRoutingStrategy;
  minValidationScore: number;
  baselineProductionVersion: string;
  lifecycle: ShadowAdapterLifecycle;
  registeredAt: string;
  promotedAt?: string;
  loraLoaded: boolean;
}

/** 单次在线阴影对比样本 */
export interface ShadowGraderSample {
  requestId: string;
  shadowVersion: string;
  productionOutcome: string;
  productionReward: number;
  productionSafetyPass: boolean;
  productionHadRepair: boolean;
  shadowReward: number;
  shadowSafetyPass: boolean;
  shadowJsonValid: boolean;
  shadowWins: boolean;
  gradedAt: string;
  latencyMs?: number;
}

export interface ShadowGraderAggregateMetrics {
  shadowVersion: string;
  sampleCount: number;
  shadowWinCount: number;
  shadowWinRate: number;
  productionSafetyPassRate: number;
  shadowSafetyPassRate: number;
  productionAvgReward: number;
  shadowAvgReward: number;
  promotionReady: boolean;
  promotionBlockers: string[];
}

export interface ShadowPromotionResult {
  shadowVersion: string;
  promoted: boolean;
  productionVersion?: string;
  reason: string;
}
