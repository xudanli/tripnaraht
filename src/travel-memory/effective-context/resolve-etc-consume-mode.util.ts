/**
 * EFFECTIVE_TRAVELER_CONTEXT_CONSUME — Injector 读 ETC 的开关。
 *
 * off（默认）：忽略 ETC，行为与 M1 前一致
 * shadow：用 ETC 投影算候选 DecisionParams，只做 diff，不替换线上
 * active：用 ETC 投影替换 OS-only 映射结果（L2 override 可生效）
 */

export type EffectiveTravelerContextConsumeMode = 'off' | 'shadow' | 'active';

export function resolveEffectiveTravelerContextConsumeMode(
  env: NodeJS.ProcessEnv = process.env,
): EffectiveTravelerContextConsumeMode {
  const raw = String(env.EFFECTIVE_TRAVELER_CONTEXT_CONSUME ?? '')
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
