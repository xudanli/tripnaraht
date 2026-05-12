import type {
  BehaviorSignal,
  DistanceOverrideSignal,
  FatigueRejectionSignal,
  PaceComplaintSignal,
} from './behavior-signal.types';
import type { UserIntentState } from './user-intent-state.types';

const CLAMP = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));

/** 空画像默认值（可持久化层覆盖） */
export function createDefaultUserIntentState(userId: string): UserIntentState {
  return {
    userId,
    shortTermIntent: { extractedPreferences: [] },
    longTermProfile: {
      preferredPace: 0.5,
      preferredFoodStyle: [],
      mobilityTolerance: 0.5,
      spontaneityLevel: 0.5,
      budgetSensitivity: 0.5,
    },
    behaviorMemory: {
      acceptedPlaceIds: [],
      rejectedPlaceIds: [],
      overridePatterns: [],
    },
    schemaVersion: 1,
  };
}

/**
 * 将单次行为信号折叠进 UserIntentState（纯函数，便于测试与回放）。
 * 后续可换为学习模型，仅替换此函数。
 */
export function applyBehaviorSignal(state: UserIntentState, signal: BehaviorSignal): UserIntentState {
  const next: UserIntentState = JSON.parse(JSON.stringify(state)) as UserIntentState;
  const mem = next.behaviorMemory;
  const prof = next.longTermProfile;

  switch (signal.type) {
    case 'fatigue_rejection': {
      const s = signal as FatigueRejectionSignal;
      mem.overridePatterns.push(
        `fatigue:${s.signal}${s.targetSlot ? `:${s.targetSlot}` : ''}`,
      );
      prof.preferredPace = CLAMP(prof.preferredPace - 0.06 * s.confidence);
      prof.spontaneityLevel = CLAMP(prof.spontaneityLevel + 0.03 * s.confidence);
      break;
    }
    case 'pace_complaint': {
      const s = signal as PaceComplaintSignal;
      if (s.direction === 'too_fast') {
        prof.preferredPace = CLAMP(prof.preferredPace - 0.08 * s.confidence);
      } else {
        prof.preferredPace = CLAMP(prof.preferredPace + 0.06 * s.confidence);
      }
      break;
    }
    case 'distance_override': {
      const s = signal as DistanceOverrideSignal;
      prof.mobilityTolerance = CLAMP(
        prof.mobilityTolerance + 0.05 * (s.countDelta ?? 1) * s.confidence,
      );
      mem.overridePatterns.push('distance_override');
      break;
    }
    case 'explicit_reject':
      if ('placeId' in signal && signal.placeId != null) {
        if (!mem.rejectedPlaceIds.includes(signal.placeId)) mem.rejectedPlaceIds.push(signal.placeId);
      }
      break;
    case 'explicit_favorite':
      if ('placeId' in signal && signal.placeId != null) {
        if (!mem.acceptedPlaceIds.includes(signal.placeId)) mem.acceptedPlaceIds.push(signal.placeId);
      }
      break;
    default:
      mem.overridePatterns.push(`signal:${signal.type}`);
      break;
  }

  return next;
}

/** 规则：疲劳拒绝累计过多 → 进一步压低 pace（与文档阈值对齐的可调版本） */
export function applyAccumulatedFatigueRule(state: UserIntentState, fatigueCount: number): UserIntentState {
  if (fatigueCount <= 3) return state;
  const next = JSON.parse(JSON.stringify(state)) as UserIntentState;
  next.longTermProfile.preferredPace = CLAMP(next.longTermProfile.preferredPace - 0.05 * (fatigueCount - 3));
  return next;
}
