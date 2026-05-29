import type { HikingTrailDetail } from '../../route-directions/types/hiking-trail-detail.types';

export type ReadinessFactorScore = {
  label: string;
  score: number;
  detailZh: string;
};

export type ReadinessFactors = {
  season: ReadinessFactorScore;
  weather: ReadinessFactorScore;
  terrain: ReadinessFactorScore;
  fitness: ReadinessFactorScore;
};

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** 四象限因子，与总 score 加权一致（各 25%） */
export function buildReadinessFactors(
  detail: HikingTrailDetail | null,
  options: {
    longestHike?: number;
    fitnessEligible?: boolean;
    baseScore: number;
  },
): { factors: ReadinessFactors; headlineZh: string; summaryZh: string } {
  const seasonality = detail?.weatherRisk;
  const risk = detail?.riskMatrix;
  const fitness = detail?.fitnessMatch;
  const summary = detail?.summary;

  const seasonScore = seasonality?.level === 'high' ? 55 : seasonality?.level === 'medium' ? 72 : 88;
  const season: ReadinessFactorScore = {
    label: '季节',
    score: clampScore(seasonScore),
    detailZh:
      seasonality?.headlineZh ??
      (seasonality?.rules?.length
        ? seasonality.rules.slice(0, 2).join('；')
        : '请确认目的地开放季节与窗口期'),
  };

  const weatherScore =
    risk?.weatherSensitivity === 'high'
      ? 58
      : risk?.weatherSensitivity === 'medium'
        ? 74
        : 85;
  const weather: ReadinessFactorScore = {
    label: '天气',
    score: clampScore(weatherScore),
    detailZh: risk?.riverCrossing
      ? '高地天气多变，需关注风速与降水；融水河流午后水位上涨'
      : '关注沿途天气预报与突发恶劣天气预案',
  };

  const exposure =
    risk?.exposureLevel === 'high' ? 52 : risk?.exposureLevel === 'medium' ? 68 : 82;
  const ascent = summary?.totalAscentM ?? 0;
  const terrainPenalty = ascent > 5000 ? 12 : ascent > 2000 ? 6 : 0;
  const terrain: ReadinessFactorScore = {
    label: '地形',
    score: clampScore(exposure - terrainPenalty),
    detailZh: `累计爬升约 ${ascent}m，暴露等级 ${risk?.exposureLevel ?? 'medium'}${risk?.riverCrossing ? '，含涉水路段' : ''}`,
  };

  const hikeLevel = options.longestHike ?? fitness?.longestHike ?? 2;
  const paceOk = options.fitnessEligible ?? fitness?.eligible ?? true;
  const fitnessScore = paceOk
    ? clampScore(65 + hikeLevel * 5)
    : clampScore(45 + hikeLevel * 4);
  const fitnessFactor: ReadinessFactorScore = {
    label: '体能',
    score: fitnessScore,
    detailZh: fitness
      ? `问卷最长连续 ${hikeLevel} 天；建议单日爬升约 ${fitness.maxDailyAscentM}m 内${paceOk ? '' : '，部分日程偏紧'}`
      : `当前体能档位 ${hikeLevel}，建议完成问卷后重新评估`,
  };

  const factors: ReadinessFactors = { season, weather, terrain, fitness: fitnessFactor };
  const composite = clampScore(
    (factors.season.score +
      factors.weather.score +
      factors.terrain.score +
      factors.fitness.score) /
      4,
  );
  const score = options.baseScore;
  const displayScore = Math.round(score * 0.6 + composite * 0.4);

  const headlineZh =
    displayScore >= 70
      ? '整体适宜出发，请完成许可与装备准备'
      : displayScore >= 50
        ? '可以规划，但需关注季节窗口与体能节奏'
        : '建议调整行程或加强准备后再出发';

  const summaryZh = `综合 ${displayScore} 分（路线 ${score} · 四象限 ${composite}）。${season.detailZh.slice(0, 40)}…`;

  return { factors, headlineZh, summaryZh };
}
