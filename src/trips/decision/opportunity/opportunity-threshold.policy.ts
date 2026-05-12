/**
 * 迁移闸门阈值 — 依 chase 姿态 / observationIntent 变化，避免固定 magic number。
 */

import type { ObservationIntent } from '../observation-intent.types';

/** 用户或计划层对「是否值得为极光折腾」的姿态 */
export type AuroraMigrationStance = 'casual' | 'balanced' | 'hardcore';

/** 归一化机会分阈值（与 `normalizeTradeoffScore01(raw)` 同尺度 0–1） */
const STANCE_THRESHOLD_NORMALIZED: Record<AuroraMigrationStance, number> = {
  casual: 0.75,
  balanced: 0.6,
  hardcore: 0.45,
};

/** Neptune / repair：normalizedTradeoff > 此值才视为经济学批准迁移 */
export function migrationNormalizedThreshold(stance: AuroraMigrationStance): number {
  return STANCE_THRESHOLD_NORMALIZED[stance];
}

/** @deprecated 使用 migrationNormalizedThreshold */
export function migrationTradeoffThreshold(stance: AuroraMigrationStance): number {
  return migrationNormalizedThreshold(stance);
}

/**
 * 由 observationIntent 推导 stance：CHASE + HIGH → hardcore；FIXED → casual。
 */
export function migrationStanceFromObservationIntent(
  intent: ObservationIntent | undefined,
): AuroraMigrationStance {
  if (!intent || intent.target !== 'AURORA') {
    return 'balanced';
  }
  if (intent.flexibility === 'CHASE' && intent.priority === 'HIGH') {
    return 'hardcore';
  }
  if (intent.flexibility === 'FIXED') {
    return 'casual';
  }
  if (intent.flexibility === 'CHASE') {
    return 'balanced';
  }
  return 'balanced';
}

/**
 * 由行程偏好粗粒度映射（无 intent 时的默认）。
 */
export function migrationStanceFromAuroraIntentWeight(auroraWeight: number | undefined): AuroraMigrationStance {
  if (auroraWeight === undefined) {
    return 'balanced';
  }
  if (auroraWeight >= 0.72) {
    return 'hardcore';
  }
  if (auroraWeight <= 0.38) {
    return 'casual';
  }
  return 'balanced';
}
