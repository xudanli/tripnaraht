import type { DecisionState } from '../../../decision/kernel/decision-state.types';

/** 目的地侧环境可预测性分档（供酒店窄轨内调节 risk_buffer，不用于关闭心理熔断）。 */
export type HotelEnvironmentConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function asFinite01(x: unknown): number | undefined {
  if (typeof x === 'number' && Number.isFinite(x)) return clamp01(x);
  if (typeof x === 'string' && x.trim()) {
    const v = Number.parseFloat(x);
    if (Number.isFinite(v)) return clamp01(v);
  }
  return undefined;
}

/**
 * 从 Leader 工作区 `researchData` 与可选 DSO 投影推导「环境置信度」分档。
 * 优先使用 `uncertaintyProfile.entropy01`、`dso.confidence`，其次天气/失败风险等研究侧信号。
 */
export function resolveHotelEnvironmentConfidence(args: {
  researchData: Record<string, unknown>;
  dso?: DecisionState;
}): HotelEnvironmentConfidence {
  const rd = args.researchData;
  const dso = args.dso;
  const up = dso?.uncertaintyProfile;
  const e01 = up?.entropy01;
  if (typeof e01 === 'number' && Number.isFinite(e01)) {
    const e = clamp01(e01);
    if (e <= 0.38) return 'HIGH';
    if (e >= 0.62) return 'LOW';
    return 'MEDIUM';
  }

  const dConf = dso?.confidence;
  if (typeof dConf === 'number' && Number.isFinite(dConf)) {
    const c = clamp01(dConf);
    if (c >= 0.78) return 'HIGH';
    if (c <= 0.42) return 'LOW';
    return 'MEDIUM';
  }

  const wr = asFinite01(rd.weather_risk ?? rd.weatherRisk);
  if (wr !== undefined) {
    if (wr >= 0.55) return 'LOW';
    if (wr <= 0.28) return 'HIGH';
    return 'MEDIUM';
  }

  const frp = rd.failure_risk_prediction as Record<string, unknown> | undefined;
  const preds = frp?.predictions;
  if (Array.isArray(preds) && preds.length > 0) {
    const top = preds[0] as Record<string, unknown> | undefined;
    const lvl = top?.risk_level ?? top?.riskLevel ?? top?.level;
    if (lvl === 'HIGH' || lvl === 'CRITICAL') return 'LOW';
    if (lvl === 'LOW') return 'HIGH';
  }

  const frlRaw =
    rd.failure_risk_level ??
    rd.failureRiskLevel ??
    (dso?.environmentState as Record<string, unknown> | undefined)?.failureRiskLevel ??
    (dso?.environmentState as { failureRiskLevel?: string } | undefined)?.failureRiskLevel;
  const frl = typeof frlRaw === 'string' ? frlRaw.trim().toUpperCase() : '';
  if (frl === 'HIGH') return 'LOW';
  if (frl === 'LOW') return 'HIGH';

  const rk = dso?.riskLevel;
  if (rk === 'CRITICAL' || rk === 'HIGH') return 'LOW';

  return 'MEDIUM';
}

export function hotelStabilityRiskBuffer(env: HotelEnvironmentConfidence): 'MODERATE' | 'MAXIMUM' {
  return env === 'HIGH' ? 'MODERATE' : 'MAXIMUM';
}
