import type { IcelandWeatherSeverityClassifierOutput } from '../iceland-world-driving-contracts';
import type { WeatherForecast } from '../services/iceland-weather-realtime.service';

function parseCode(code?: string): number {
  if (code == null || code === '') return -1;
  const n = parseInt(String(code), 10);
  return Number.isFinite(n) ? n : -1;
}

/**
 * Maps raw forecast + CAP-style warnings to operational travel risk for driving OS.
 */
export function classifyWeatherOperationalSeverity(
  forecast: Pick<
    WeatherForecast,
    'windSpeed' | 'visibility' | 'precipitation' | 'weatherCode' | 'warnings' | 'hazards'
  >,
): IcelandWeatherSeverityClassifierOutput {
  const drivingRecommendation: string[] = [];
  const w = typeof forecast.windSpeed === 'number' ? forecast.windSpeed : undefined;
  const vis = typeof forecast.visibility === 'number' ? forecast.visibility : undefined;
  const precip = typeof forecast.precipitation === 'number' ? forecast.precipitation : undefined;
  const code = parseCode(forecast.weatherCode);

  const rawWarnings = Array.isArray(forecast.warnings) ? forecast.warnings : [];
  const hasVeryHigh = rawWarnings.some((x) => x?.severity === 'very_high');
  const hasHigh = rawWarnings.some((x) => x?.severity === 'high' || x?.severity === 'very_high');

  // Icy / freezing precipitation bands (Open-Meteo WMO): 56–57 freezing drizzle, 66+ freezing rain variants
  const icyMix = code === 56 || code === 57 || code >= 66;

  if (w !== undefined && w >= 22) {
    drivingRecommendation.push('横风/大风：房车与高车身车辆避免开阔海岸与桥梁路段；必要时推迟出发。');
  } else if (w !== undefined && w >= 15) {
    drivingRecommendation.push('风速偏高：保持双手握盘、降低车速、注意开门安全。');
  }

  if (vis !== undefined && vis < 5000) {
    drivingRecommendation.push('能见度下降：拉长车距、开雾灯（遵守当地规定）。');
  }

  if (precip !== undefined && precip > 5) {
    drivingRecommendation.push('强降水：注意轮胎抓地力与局部积水。');
  }

  if (icyMix) {
    drivingRecommendation.push('冻雨/结冰降水：非必要不出行；若必须出行使用冬季胎并查询 road.is。');
  }

  let travelRisk: IcelandWeatherSeverityClassifierOutput['travelRisk'] = 'safe';

  if (hasVeryHigh || (w !== undefined && w >= 25) || (vis !== undefined && vis < 800) || icyMix) {
    travelRisk = 'avoid_nonessential';
  } else if (
    (w !== undefined && w >= 22) ||
    (vis !== undefined && vis < 1000) ||
    (code >= 95 && code <= 99)
  ) {
    travelRisk = 'avoid_nonessential';
  } else if ((w !== undefined && w >= 18) || (vis !== undefined && vis < 2000) || hasHigh) {
    travelRisk = 'dangerous';
  } else if ((w !== undefined && w >= 12) || (vis !== undefined && vis < 5000) || (precip !== undefined && precip > 5)) {
    travelRisk = 'caution';
  }

  if (travelRisk === 'safe' && drivingRecommendation.length > 0) {
    travelRisk = 'caution';
  }

  return { travelRisk, drivingRecommendation };
}
