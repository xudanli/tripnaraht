/**
 * 6.1 Emotional Resonance — 叙事与缝合策略阈值（与计算器 / Narrator 共享）。
 */

/** 挫败感熔断：≥ 此值则关闭激进缝合，并切换到歉意恢复 / 共情安抚语气 */
export const FRUSTRATION_CIRCUIT_BREAKER_THRESHOLD = 0.52;

/** Loss-Gain 情绪对冲话术：容忍度溢价须高于此值才启用（与缝合场景组合） */
export const TOLERANCE_BONUS_LOSS_GAIN_FRAMING_THRESHOLD = 0.2;
