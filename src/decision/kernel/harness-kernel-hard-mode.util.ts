import type { HarnessShadowCheckSnapshot } from './harness-shadow-metrics.collector';

/**
 * Harness Kernel 同步硬门禁 SSOT。
 * `HARNESS_KERNEL_HARD=1`：运维签字后启用 — 等价开启 post-phase shadow + strict block。
 * 演练：`HARNESS_KERNEL_SHADOW_STRICT=1`（须配合 `HARNESS_SHADOW_AFTER_PHASE=1`）。
 */
export function parseHarnessKernelHardEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.HARNESS_KERNEL_HARD?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'on';
}

export function parseHarnessKernelShadowStrictEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (parseHarnessKernelHardEnabled(env)) return true;
  const v = env.HARNESS_KERNEL_SHADOW_STRICT?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'on';
}

export function parseHarnessShadowAfterPhaseEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (parseHarnessKernelHardEnabled(env)) return true;
  return env.HARNESS_SHADOW_AFTER_PHASE?.trim() === '1';
}

export function parseHarnessShadowConsecutiveThreshold(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.HARNESS_SHADOW_CONSECUTIVE_THRESHOLD?.trim();
  const n = Number(raw ?? '100');
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 100;
}

export interface HarnessKernelHardDiagnosticsSnapshot {
  enabled: boolean;
  shadow_after_phase: boolean;
  shadow_strict: boolean;
  consecutive_success_count: number;
  consecutive_threshold: number;
  sign_off_eligible: boolean;
  ops_readiness: {
    ready: boolean;
    blockers: string[];
  };
}

export function buildHarnessKernelHardDiagnosticsSnapshot(params: {
  shadowMetrics: HarnessShadowCheckSnapshot;
  env?: NodeJS.ProcessEnv;
}): HarnessKernelHardDiagnosticsSnapshot {
  const env = params.env ?? process.env;
  const enabled = parseHarnessKernelHardEnabled(env);
  const shadowAfterPhase = parseHarnessShadowAfterPhaseEnabled(env);
  const shadowStrict = parseHarnessKernelShadowStrictEnabled(env);
  const threshold = parseHarnessShadowConsecutiveThreshold(env);
  const consecutive = params.shadowMetrics.consecutive_success_count;

  const blockers: string[] = [];
  if (enabled) {
    if (!shadowAfterPhase) blockers.push('shadow_after_phase_off');
    if (!shadowStrict) blockers.push('shadow_strict_off');
  } else {
    if (!shadowAfterPhase) blockers.push('HARNESS_SHADOW_AFTER_PHASE_off');
    if (consecutive < threshold) {
      blockers.push(`consecutive_${consecutive}_lt_${threshold}`);
    }
  }

  const signOffEligible = !enabled && shadowAfterPhase && consecutive >= threshold;

  return {
    enabled,
    shadow_after_phase: shadowAfterPhase,
    shadow_strict: shadowStrict,
    consecutive_success_count: consecutive,
    consecutive_threshold: threshold,
    sign_off_eligible: signOffEligible,
    ops_readiness: {
      ready: enabled ? blockers.length === 0 : signOffEligible,
      blockers,
    },
  };
}
