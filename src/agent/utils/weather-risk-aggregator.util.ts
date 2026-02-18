/**
 * 天气风险聚合工具
 *
 * 缺口解决方案：research_data.weather_risk 从未被写入，导致 environmentState.weatherRisk 常为空。
 * 本工具从现有天气相关数据聚合出 0-1 的 weather_risk，供 orchestrator-state-mapper 提取。
 *
 * 数据源优先级：
 * 1. failure_risk_prediction（含 weather 的 riskFactors + riskLevel）
 * 2. weather_predictions（降水、风速、能见度）
 * 3. weather_forecast（travel_suitability）
 *
 * 参考：docs/THREE_GUARDIANS_DECISION_LOGIC.md（天气属于 Abu 主责）
 */

/** research_data 中天气相关字段的松散类型 */
export interface WeatherResearchData {
  failure_risk_prediction?: {
    predictions?: Array<{
      day: number;
      riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
      riskFactors?: string[];
    }>;
  };
  weather_predictions?: Array<{
    windSpeed?: number;
    precipitation?: number;
    visibility?: number;
    temperature?: number;
    accessibilityScore?: number;
  }>;
  weather_forecast?: {
    forecasts?: Array<{
      travel_suitability?: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' | 'DANGEROUS';
      precipitation?: { probability?: number; amount_mm?: number };
      wind?: { speed_kmh?: number; gust_kmh?: number };
      visibility_km?: number;
    }>;
  };
}

/**
 * 从 research_data 聚合 weather_risk (0-1)
 * 无数据时返回 undefined，由调用方决定是否使用默认值
 */
export function aggregateWeatherRisk(researchData: WeatherResearchData): number | undefined {
  const sources: number[] = [];

  // 1. failure_risk_prediction：有 weather 的 riskFactors 时，按 riskLevel 加权
  const frp = researchData.failure_risk_prediction?.predictions;
  if (frp?.length) {
    const weatherDays = frp.filter((p) => p.riskFactors?.includes('weather'));
    if (weatherDays.length > 0) {
      const levelScore = (l: string) =>
        l === 'HIGH' || l === 'CRITICAL' ? 0.7 : l === 'MEDIUM' ? 0.4 : 0.2;
      const avg =
        weatherDays.reduce((s, p) => s + levelScore(p.riskLevel || 'LOW'), 0) / weatherDays.length;
      sources.push(Math.min(1, avg * 1.2)); // 有天气风险时略放大
    }
  }

  // 2. weather_predictions：按日聚合，与 FailureRiskPredictionService.getWeatherRisk 一致
  const wp = researchData.weather_predictions;
  if (wp?.length) {
    let totalRisk = 0;
    for (const p of wp) {
      let risk = 0;
      if ((p.windSpeed ?? 0) > 20) risk += 0.3;
      else if ((p.windSpeed ?? 0) > 15) risk += 0.15;
      if ((p.precipitation ?? 0) > 10) risk += 0.2;
      else if ((p.precipitation ?? 0) > 5) risk += 0.1;
      const vis = p.visibility ?? 10000;
      if (vis < 1000) risk += 0.3;
      else if (vis < 5000) risk += 0.15;
      totalRisk += Math.min(1, risk);
    }
    const avgRisk = totalRisk / wp.length;
    if (avgRisk > 0) sources.push(avgRisk);
  }

  // 3. weather_forecast：travel_suitability
  const wf = researchData.weather_forecast?.forecasts;
  if (wf?.length) {
    const suitScore = (s: string) =>
      s === 'DANGEROUS' ? 0.9 : s === 'POOR' ? 0.6 : s === 'FAIR' ? 0.35 : s === 'GOOD' ? 0.15 : 0.05;
    const avg =
      wf.reduce((s, f) => s + suitScore(f.travel_suitability || 'GOOD'), 0) / wf.length;
    if (avg > 0.1) sources.push(avg);
  }

  if (sources.length === 0) return undefined;
  // 取最高源（最保守），并限制在 0-1
  const value = Math.min(1, Math.max(0, Math.max(...sources)));
  return Math.round(value * 100) / 100;
}
