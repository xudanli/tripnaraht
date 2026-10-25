/**
 * TRAVELER_MEMORY_WRITE_GATE — 脏写收口开关（M6）。
 *
 * off（默认）：旧路径直写 UserProfile.preferences
 * shadow：双写（旧路径 + Traveler Memory Candidate），可对照
 * active：只写 Traveler Memory Candidate，跳过对 L1/UserProfile 偏好污染字段的 upsert
 */

export type TravelerMemoryWriteGateMode = 'off' | 'shadow' | 'active';

export function resolveTravelerMemoryWriteGateMode(
  env: NodeJS.ProcessEnv = process.env,
): TravelerMemoryWriteGateMode {
  const raw = String(env.TRAVELER_MEMORY_WRITE_GATE ?? '')
    .trim()
    .toLowerCase();
  if (raw === 'active' || raw === '1' || raw === 'true' || raw === 'on') {
    return 'active';
  }
  if (raw === 'shadow' || raw === 'diff') {
    return 'shadow';
  }
  return 'off';
}
