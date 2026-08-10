/**
 * TRAVELING 执行态：结论优先文案（不扩意图词典；由 lifecycle + 既有信号触发）。
 */

export type TravelingExecutionConclusionInput = {
  answer_text?: string;
  weather_risk_zh?: string | null;
  road_alert_zh?: string | null;
  delay_minutes?: number | null;
  suggested_depart_within_minutes?: number | null;
  alternative_shorten_zh?: string | null;
};

export type TravelingExecutionConclusion = {
  conclusion_zh: string;
  rationale_zh?: string;
  alternatives_zh: string[];
  severity: 'info' | 'soft' | 'hard';
};

/**
 * 从已有事实块拼装执行结论（先结论、后理由）。
 */
export function buildTravelingExecutionConclusion(
  input: TravelingExecutionConclusionInput,
): TravelingExecutionConclusion {
  const alts: string[] = [];
  if (input.alternative_shorten_zh) alts.push(input.alternative_shorten_zh);

  const depart =
    input.suggested_depart_within_minutes != null &&
    input.suggested_depart_within_minutes > 0
      ? `建议 ${input.suggested_depart_within_minutes} 分钟内出发。`
      : null;

  const weather = String(input.weather_risk_zh ?? '').trim();
  const road = String(input.road_alert_zh ?? '').trim();
  const delay =
    input.delay_minutes != null && input.delay_minutes > 0
      ? `进度已落后约 ${input.delay_minutes} 分钟。`
      : '';

  let severity: TravelingExecutionConclusion['severity'] = 'info';
  if (road || /封路|关闭|不可通行/i.test(weather)) severity = 'hard';
  else if (weather || delay) severity = 'soft';

  const conclusion =
    depart ||
    (severity === 'hard'
      ? '当前不建议按原计划继续，请先确认道路与天气。'
      : severity === 'soft'
        ? '建议调整今日节奏后再继续。'
        : String(input.answer_text ?? '').trim().slice(0, 120) ||
          '今日可按原计划执行，请留意实时路况。');

  const rationaleParts = [weather, road, delay].filter(Boolean);
  if (!alts.length && severity === 'soft') {
    alts.push('缩短下一站停留 30 分钟');
    alts.push('改为室内或低风备选');
  }

  return {
    conclusion_zh: conclusion,
    ...(rationaleParts.length
      ? { rationale_zh: rationaleParts.join(' ') }
      : {}),
    alternatives_zh: alts.slice(0, 4),
    severity,
  };
}

/** 既有信号：是否应按 TRAVELING 执行结论口径组装（不新增意图词表） */
export function shouldUseTravelingExecutionFocus(params: {
  lifecycle: string;
  message: string;
  weatherImpact?: boolean;
}): boolean {
  if (params.lifecycle !== 'TRAVELING') return false;
  if (params.weatherImpact) return true;
  return /还能去|还能走|现在怎么办|晚了|赶不上|提前出发|风这么大|路关闭|直接回酒店/i.test(
    params.message,
  );
}
