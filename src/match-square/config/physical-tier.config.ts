import type { PremiumTrekkingScriptId } from './premium-trekking.config';
import type { PhysicalTierLevel, RoutePhysicalProfile } from '../types/physical-fitness-gate.types';

const TIER_LABELS: Record<PhysicalTierLevel, string> = {
  1: 'Level 1 · 城市休闲',
  2: 'Level 2 · 轻装入门',
  3: 'Level 3 · 中级徒步',
  4: 'Level 4 · 重装进阶',
  5: 'Level 5 · 极限远征',
};

export const PHYSICAL_TIER_HARD_INTERCEPT_MIN = 4 as const;

export const PHYSICAL_INTERCEPT_THRESHOLD_RATIO = 0.8;

/** Premium Trekking 剧本 → 路线物理极值（Decision Engine Layer 0 SSOT） */
export const ROUTE_PHYSICAL_BY_SCRIPT: Record<PremiumTrekkingScriptId, RoutePhysicalProfile> = {
  iceland_laugavegur_heavy_trek: {
    tier: 4,
    tierLabel: TIER_LABELS[4],
    maxDailyAscentM: 1400,
    maxAltitudeM: 1100,
    maxPackWeightKg: 20,
    requiresHeavyPackCamping: true,
    interceptThresholdRatio: PHYSICAL_INTERCEPT_THRESHOLD_RATIO,
  },
  chuanxi_heavy_trek: {
    tier: 4,
    tierLabel: TIER_LABELS[4],
    maxDailyAscentM: 1800,
    maxAltitudeM: 4700,
    maxPackWeightKg: 22,
    requiresHeavyPackCamping: true,
    interceptThresholdRatio: PHYSICAL_INTERCEPT_THRESHOLD_RATIO,
  },
  light_trek_dyl_retreat: {
    tier: 2,
    tierLabel: TIER_LABELS[2],
    maxDailyAscentM: 600,
    maxAltitudeM: 3200,
    maxPackWeightKg: 12,
    requiresHeavyPackCamping: false,
    interceptThresholdRatio: PHYSICAL_INTERCEPT_THRESHOLD_RATIO,
  },
  weekend_fast_light_trek: {
    tier: 2,
    tierLabel: TIER_LABELS[2],
    maxDailyAscentM: 500,
    maxAltitudeM: 800,
    maxPackWeightKg: 8,
    requiresHeavyPackCamping: false,
    interceptThresholdRatio: PHYSICAL_INTERCEPT_THRESHOLD_RATIO,
  },
};

export function formatPhysicalHardGateSummary(profile: RoutePhysicalProfile): string {
  const tierShort =
    profile.tier >= 4 ? `Level ${profile.tier} · 重装进阶` : profile.tierLabel.replace(/^Level \d+ · /, '');
  return `🏃 体能门槛：${tierShort}`;
}

export function physicalHardGateMicroHint(tier: PhysicalTierLevel): string | null {
  if (tier < PHYSICAL_TIER_HARD_INTERCEPT_MIN) return null;
  return '系统将自动拦截无重装/高海拔经验的申请者';
}
