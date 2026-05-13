import { FRUSTRATION_CIRCUIT_BREAKER_THRESHOLD } from './emotional-resonance.constants';
import type { UserEmotionalAccount } from './user-emotional-account.types';

/** 6.x：Member / Skill 执行层的稳健偏好（与 5.0.1 `austerityMode` 可叠加） */
export type ResearchStabilityMode = 'BALANCED' | 'STABILITY_FIRST';

/**
 * 高挫败感时启用稳健模式：收窄 Skill 面、抑制探索型 Gossip，与 `frustration_circuit_active` 阈值对齐。
 */
export function shouldEnableStabilityMode(account: UserEmotionalAccount | undefined): boolean {
  return (account?.frustration_score ?? 0) >= FRUSTRATION_CIRCUIT_BREAKER_THRESHOLD;
}

export function resolveResearchStabilityMode(account: UserEmotionalAccount | undefined): ResearchStabilityMode {
  return shouldEnableStabilityMode(account) ? 'STABILITY_FIRST' : 'BALANCED';
}
