/**
 * Phase 6 — 旁路与双重状态收口（渐进开关）
 */

export function isPhase6LegacyDeprecationEnabled(): boolean {
  const v = process.env.PHASE6_LEGACY_DEPRECATION?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/** Agent ConstraintsEngine 正式 BLOCK 始终委托 Gateway */
export function isPhase6AgentBlockAlwaysDelegated(): boolean {
  return isPhase6LegacyDeprecationEnabled();
}

/** 禁止将 OFFICIAL_RULE / EXTERNAL 官方卡写入 unifiedConstraints */
export function isPhase6OfficialRulePersistenceBlocked(): boolean {
  return isPhase6LegacyDeprecationEnabled();
}

/** Collector 不再从 OFFICIAL_RULE TripConstraint 合成 DecisionProblem */
export function isPhase6OfficialTripConstraintProblemMergeDisabled(): boolean {
  return isPhase6LegacyDeprecationEnabled();
}

/** unified apply 拒绝 LEGACY writeChain 路径 */
export function isPhase6NonCanonicalApplyBlocked(): boolean {
  return isPhase6LegacyDeprecationEnabled();
}

/** Assembler 在 Gateway 投影已覆盖时跳过 legacy 同域 issues */
export function isPhase6AssemblerLegacyDomainRulesSkipped(): boolean {
  return isPhase6LegacyDeprecationEnabled();
}

/** GateEvalExecutor 正式 BLOCK 降级为 ADJUST_REQUIRED（权威移交 Gateway） */
export function isPhase6GateEvalFormalBlockDelegated(): boolean {
  return isPhase6LegacyDeprecationEnabled();
}