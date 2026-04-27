type AllowedVarianceLike = {
  metric?: unknown;
  op?: unknown;
  threshold?: unknown;
};

export type CompareMetric =
  | 'wind_speed_mps'
  | 'visibility_meters'
  | 'sunset_offset_min'
  | 'fatigue_index'
  | 'fatigue_overloaded_days';

export const COMPARE_METRICS: CompareMetric[] = [
  'wind_speed_mps',
  'visibility_meters',
  'sunset_offset_min',
  'fatigue_index',
  'fatigue_overloaded_days',
];

export function metricForRuleId(params: { rule_id: string; unit?: string | null }): CompareMetric | null {
  const rid = String(params.rule_id ?? '').trim();
  const unitLower = String(params.unit ?? '').toLowerCase();

  // Deterministic mapping first.
  if (rid === 'fatigue.max_daily') return 'fatigue_index';
  if (rid === 'fatigue.overloaded_days') return 'fatigue_overloaded_days';

  // Heuristic fallback by unit.
  if (unitLower.includes('m/s')) return 'wind_speed_mps';
  if (unitLower === 'm') return 'visibility_meters';
  if (unitLower.includes('min')) return 'sunset_offset_min';
  if (unitLower.includes('fatigue_index')) return 'fatigue_index';
  if (unitLower === 'days') return 'fatigue_overloaded_days';
  return null;
}

export function buildToleranceResolver(allowedVariance: AllowedVarianceLike[]) {
  const av = Array.isArray(allowedVariance) ? allowedVariance : [];

  const getAbsTol = (metric: string, fallback: number): number => {
    const r = av.find((x) => String((x as any)?.metric ?? '') === metric && String((x as any)?.op ?? '') === 'abs_delta_lte');
    const t = (r as any)?.threshold;
    return typeof t === 'number' && Number.isFinite(t) ? t : fallback;
  };

  const tolWind = getAbsTol('wind_speed_mps', 1);
  const tolVis = getAbsTol('visibility_meters', 50);
  const tolSun = getAbsTol('sunset_offset_min', 10);
  const tolFatigue = getAbsTol('fatigue_index', 0.1);
  const tolFatigueDays = getAbsTol('fatigue_overloaded_days', 0);

  const tolForMetric = (m: CompareMetric | null): number | null => {
    if (!m) return null;
    if (m === 'wind_speed_mps') return tolWind;
    if (m === 'visibility_meters') return tolVis;
    if (m === 'sunset_offset_min') return tolSun;
    if (m === 'fatigue_index') return tolFatigue;
    if (m === 'fatigue_overloaded_days') return tolFatigueDays;
    return null;
  };

  return { tolForMetric };
}

