/**
 * Shadow Grader 开关 SSOT（Harness Observability P3）。
 * 兼容 roadmap `HARNESS_SHADOW_GRADER=1` 与既有 `SHADOW_GRADER_ENABLED=1`。
 */

export function parseHarnessShadowGraderEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const harness = env.HARNESS_SHADOW_GRADER?.trim().toLowerCase();
  if (harness === '1' || harness === 'true' || harness === 'on') return true;
  if (harness === '0' || harness === 'false' || harness === 'off') return false;

  const legacy = env.SHADOW_GRADER_ENABLED?.trim().toLowerCase();
  return legacy === '1' || legacy === 'true';
}

export function parseShadowGraderLogEveryN(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.SHADOW_GRADER_LOG_EVERY_N?.trim() ?? env.HARNESS_SHADOW_GRADER_LOG_EVERY_N?.trim();
  const n = Number(raw ?? '100');
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 100;
}
