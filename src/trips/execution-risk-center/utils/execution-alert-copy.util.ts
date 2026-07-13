/**
 * Formats execution alert copy — title (结论) / reason (事实评估) / recommendedAction (方案).
 */

import type { ActiveRisk } from '../types/execution-risk.types';

export interface ExecutionAlertCopy {
  title: string;
  reason: string;
  recommendedAction?: string;
}

export interface ExecutionAlertCopyContext {
  /** Full causal assessment (may include recommendation sentence — will be split) */
  assessmentText?: string;
  recommendedAction?: string;
  routeLabel?: string;
  /** Peak hazard wind for title (falls back to risk title/summary) */
  hazardWindMps?: number;
}

const RECOMMENDATION_LINE_PATTERNS: RegExp[] = [
  /最小干预建议将出发时间提前\s*(\d+)\s*分钟。?/,
  /若提前\s*(\d+)\s*分钟出发，错过概率可降至约\s*\d+%。?/,
  /建议将.*?提前\s*(\d+)\s*分钟。?/,
  /将.*?提早\s*(\d+)\s*分钟。?/,
];

/** Single wind value for title + assessment — advisory P90 narrative wins over env alert copy. */
export function resolveAuthoritativeWindMps(
  risk: ActiveRisk,
  ctx: ExecutionAlertCopyContext = {},
): number | undefined {
  if (ctx.hazardWindMps != null) return ctx.hazardWindMps;
  if (ctx.assessmentText) {
    const fromAssessment = extractWindMps(ctx.assessmentText);
    if (fromAssessment != null) return fromAssessment;
  }
  const gust = risk.observedMetrics?.WIND_GUST_MPS;
  const sustained = risk.observedMetrics?.WIND_SUSTAINED_MPS;
  if (typeof gust === 'number' && Number.isFinite(gust)) return Math.round(gust);
  if (typeof sustained === 'number' && Number.isFinite(sustained)) return Math.round(sustained);
  return extractWindMps(`${risk.title} ${risk.summary}`);
}

export function projectExecutionAlertCopy(
  risk: ActiveRisk,
  ctx: ExecutionAlertCopyContext = {},
): ExecutionAlertCopy {
  const route = ctx.routeLabel ?? buildRouteLabelFromRisk(risk);
  const rawAssessment = (ctx.assessmentText ?? risk.summary).trim();
  const { body, recommendedAction: splitAction, advanceMinutes } =
    splitAssessmentAndRecommendation(rawAssessment);
  const hazardWindMps = resolveAuthoritativeWindMps(risk, ctx);

  const recommendedAction =
    ctx.recommendedAction ??
    (advanceMinutes != null ? buildAdvanceDepartureAction(risk, route, advanceMinutes) : undefined) ??
    splitAction;

  if (isStructuredTravelAssessment(body)) {
    return {
      title: buildWeatherStopTitle(risk, route, hazardWindMps),
      reason: body,
      recommendedAction,
    };
  }

  if (risk.type === 'ENVIRONMENT' || risk.code.startsWith('WEATHER_')) {
    const reason = expandEnvironmentAssessment(risk, body || buildFallbackAssessment(risk, route));
    return {
      title: buildWeatherStopTitle(risk, route, hazardWindMps),
      reason,
      recommendedAction,
    };
  }

  return {
    title: risk.title,
    reason: body || risk.summary,
    recommendedAction,
  };
}

export function buildRouteLabelFromRisk(risk: ActiveRisk): string | undefined {
  const segments = risk.affectedRouteSegments.map((s) => s.label).filter(Boolean);
  if (segments.length > 0) return segments.join(' → ');

  const acts = risk.affectedActivities.map((a) => a.label).filter(Boolean);
  if (acts.length >= 2) return `${acts[0]} → ${acts[acts.length - 1]}`;
  if (acts.length === 1) return acts[0];

  return extractRouteFromText(risk.summary) ?? extractRouteFromText(risk.title);
}

export function buildWeatherStopTitle(
  risk: ActiveRisk,
  route?: string,
  hazardWindMps?: number,
): string {
  const routeLabel = route ?? '当前路段';
  const hazard = buildWeatherHazardPhrase(risk, hazardWindMps);
  return `${routeLabel}：${hazard}，不建议按原计划出发`;
}

export function buildWeatherHazardPhrase(risk: ActiveRisk, hazardWindMps?: number): string {
  const text = `${risk.title} ${risk.summary}`.toLowerCase();
  let headline = '环境预警';

  if (risk.code === 'WEATHER_HEAVY_RAIN' || /暴雨|强降雨|heavy rain/.test(text)) {
    headline = '暴雨预警';
  } else if (risk.code === 'WEATHER_STRONG_WIND' || /强风|阵风|wind/.test(text)) {
    headline = '强风预警';
  } else   if (risk.code === 'WEATHER_SEVERE') {
    headline = '恶劣天气预警';
  } else if (/ash fall|volcanic ash|火山灰/.test(text)) {
    headline = '火山灰预警';
  } else if (/air quality|空气质量/.test(text)) {
    headline = '空气质量预警';
  }

  const slippery =
    risk.code === 'WEATHER_HEAVY_RAIN' ||
    risk.code === 'ROAD_SLIPPERY' ||
    /湿滑|slippery|rain|雨|路面/.test(text);
  const windMps = hazardWindMps ?? extractWindMps(`${risk.title} ${risk.summary}`);

  if (slippery && windMps != null) {
    return `${headline}路面湿滑且侧风${windMps}m/s`;
  }
  if (slippery) return `${headline}路面湿滑`;
  if (windMps != null) return `${headline}侧风${windMps}m/s`;
  return headline;
}

export function splitAssessmentAndRecommendation(text: string): {
  body: string;
  recommendedAction?: string;
  advanceMinutes?: number;
} {
  let body = text.trim();
  let recommendedAction: string | undefined;
  let advanceMinutes: number | undefined;

  for (const pattern of RECOMMENDATION_LINE_PATTERNS) {
    const match = body.match(pattern);
    if (!match) continue;
    advanceMinutes = Number(match[1]);
    recommendedAction = match[0].replace(/。$/, '');
    body = body.replace(match[0], '').trim();
    break;
  }

  body = body.replace(/\s*。?\s*$/, '').trim();
  if (body.endsWith('。')) {
    // keep sentence terminators inside body
  } else if (body.length > 0) {
    body = `${body}。`.replace(/。。+/g, '。');
  }

  return { body, recommendedAction, advanceMinutes };
}

function buildAdvanceDepartureAction(
  risk: ActiveRisk,
  route: string | undefined,
  minutes: number,
): string {
  const origin =
    risk.affectedActivities[0]?.label ??
    route?.split('→')[0]?.trim() ??
    '起点';
  return `将${origin}的时间提早${minutes}分钟`;
}

function buildFallbackAssessment(risk: ActiveRisk, route?: string): string {
  const routePart = route ? `${route}：` : '';
  const wind = resolveAuthoritativeWindMps(risk);
  if (wind != null) {
    return `${routePart}预计侧风约 ${wind} m/s，请结合路况评估是否按原计划出发。`;
  }
  return expandEnvironmentAssessment(risk, risk.summary);
}

function expandEnvironmentAssessment(risk: ActiveRisk, text: string): string {
  const raw = text.trim();
  const lower = raw.toLowerCase();
  if (!raw) return raw;

  if (/ash fall/.test(lower) && /air quality|hazardous/.test(lower)) {
    return '火山灰沉降可能导致空气质量降至危险水平，不建议按原计划进入受影响区域。';
  }
  if (/volcanic ash/.test(lower)) {
    return '火山灰可能影响能见度与空气质量，请结合官方通报评估是否继续按原计划出发。';
  }
  if (raw === risk.title.trim() && risk.type === 'ENVIRONMENT') {
    const route = buildRouteLabelFromRisk(risk);
    return route
      ? `${route}存在环境风险：${raw}。请结合路况与官方通报后再决定是否继续。`
      : `当前路段存在环境风险：${raw}。请结合路况与官方通报后再决定是否继续。`;
  }
  return raw;
}

function isStructuredTravelAssessment(text: string): boolean {
  return /P90|错过.*概率|m\/s|基准/.test(text);
}

function extractRouteFromText(text: string): string | undefined {
  const match = text.match(/([^\s。；]+?)\s*(?:→|->|—>)\s*([^\s。；]+)/);
  if (!match) return undefined;
  return `${match[1].trim()} → ${match[2].trim()}`;
}

function extractWindMps(text: string): number | undefined {
  const m = text.match(/(?:侧风|阵风|风速|wind)[^0-9]*(\d+(?:\.\d+)?)\s*m\/s/i);
  if (m) return Math.round(Number(m[1]));
  const m2 = text.match(/(\d+(?:\.\d+)?)\s*m\/s/);
  if (m2) return Math.round(Number(m2[1]));
  return undefined;
}
