/**
 * User Intent State：动态用户模型（非单次 NL 字符串）。
 * 用于跨行程演化偏好，并注入 TripDraftContract / TripDraftState。
 */

export interface UserShortTermIntent {
  /** 当前会话或行程锚点（tripId / session 摘要） */
  currentTrip?: string;
  /** 本轮抽取的偏好标签 */
  extractedPreferences: string[];
}

export interface UserLongTermProfile {
  /** 0–1，偏好松弛节奏 */
  preferredPace: number;
  preferredFoodStyle: string[];
  /** 0–1，可承受的步行/换乘强度 */
  mobilityTolerance: number;
  /** 0–1，即兴 / 留白倾向 */
  spontaneityLevel: number;
  /** 0–1，对预算约束敏感度 */
  budgetSensitivity: number;
}

export interface UserBehaviorMemory {
  /** 用户明确留下的 placeId（接受） */
  acceptedPlaceIds: number[];
  /** 明确拒绝或替换过的 placeId */
  rejectedPlaceIds: number[];
  /** 决策 Trace / 规则归纳的模式标签，如 fatigue_rejection:museum */
  overridePatterns: string[];
}

export interface UserIntentState {
  userId: string;

  shortTermIntent: UserShortTermIntent;

  longTermProfile: UserLongTermProfile;

  behaviorMemory: UserBehaviorMemory;

  /** 预留向量检索 / 记忆召回 */
  embeddings?: number[];

  /** 模型版本，便于回放与 A/B */
  schemaVersion?: number;
}
