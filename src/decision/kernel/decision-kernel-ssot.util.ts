/**
 * PR-4 — Decision Kernel SSOT：主链 route_and_run / Kernel OPTIMIZE 为唯一权威决策路径。
 *
 * Legacy `TripDecisionEngineService.generatePlan()` HTTP 入口在 SSOT 开启时返回非权威提示，
 * 避免与 Kernel CGUS 双写判决书。直接注入调用（replay / skill-evolver）不受影响。
 */

export const DECISION_KERNEL_SSOT_HEADER = 'x-decision-kernel-ssot';
export const LEGACY_ENGINE_BYPASS_HEADER = 'x-legacy-engine-bypass';

export type LegacyEngineBypassReason = 'replay' | 'skill-evolver' | 'ops-audit' | 'explicit';

export function isDecisionKernelEnabledFromEnv(): boolean {
  const v = (process.env.DECISION_KERNEL_ENABLED ?? 'true').trim().toLowerCase();
  return v !== '0' && v !== 'false' && v !== 'no';
}

/**
 * SSOT 默认跟随 DECISION_KERNEL_ENABLED；显式 DECISION_KERNEL_SSOT=0 可单独关闭拦截。
 */
export function isDecisionKernelSsotEnabledFromEnv(): boolean {
  const explicit = process.env.DECISION_KERNEL_SSOT?.trim();
  if (explicit !== undefined && explicit !== '') {
    const lower = explicit.toLowerCase();
    return lower === '1' || lower === 'true' || lower === 'yes';
  }
  return isDecisionKernelEnabledFromEnv();
}

export function resolveLegacyEngineBypass(
  headers?: Record<string, string | string[] | undefined>,
): LegacyEngineBypassReason | undefined {
  if (!headers) return undefined;
  const lowerKeys = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]),
  );
  const raw = lowerKeys[LEGACY_ENGINE_BYPASS_HEADER];
  const val = Array.isArray(raw) ? raw[0] : raw;
  const token = String(val ?? '').trim().toLowerCase();
  if (!token) return undefined;
  if (token === 'replay' || token === 'skill-evolver' || token === 'ops-audit' || token === 'explicit') {
    return token;
  }
  if (token === '1' || token === 'true' || token === 'yes') return 'explicit';
  return undefined;
}

export function isLegacyTripEngineHttpBlocked(
  headers?: Record<string, string | string[] | undefined>,
): boolean {
  if (!isDecisionKernelSsotEnabledFromEnv()) return false;
  if (resolveLegacyEngineBypass(headers)) return false;
  return true;
}

export interface LegacyEngineSsotBlockPayload {
  code: 'LEGACY_ENGINE_SSOT_BLOCKED';
  authoritativePath: '/api/agent/route_and_run';
  authoritativeEngine: 'DecisionKernelService.executeOptimize';
  legacyEngine: 'TripDecisionEngineService.generatePlan';
  hint: string;
}

export function buildLegacyEngineSsotBlockPayload(): LegacyEngineSsotBlockPayload {
  return {
    code: 'LEGACY_ENGINE_SSOT_BLOCKED',
    authoritativePath: '/api/agent/route_and_run',
    authoritativeEngine: 'DecisionKernelService.executeOptimize',
    legacyEngine: 'TripDecisionEngineService.generatePlan',
    hint: '生产主链请使用 Decision Kernel（route_and_run）；replay 可传 X-Legacy-Engine-Bypass: replay',
  };
}
