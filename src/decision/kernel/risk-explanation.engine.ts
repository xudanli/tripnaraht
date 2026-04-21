import type { EnvIndexedJson, RiskBreakdown } from './environmental-milp-builder';

export type RiskExplanationLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type RiskExplanation = {
  level: RiskExplanationLevel;
  bullets: string[];
  /** Highest-signal factors to surface in UI and log for flywheel. */
  primaryFactors: string[];
  /** Optional hint for budget UI: how much this edge contributes (0..10). */
  riskCost: number;
};

function uniqPreserve(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of arr) {
    const k = String(x);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

function levelFromTotal(total: number): RiskExplanationLevel {
  if (total >= 9) return 'CRITICAL';
  if (total >= 6) return 'HIGH';
  if (total >= 3) return 'MEDIUM';
  return 'LOW';
}

export function explainEdgeRisk(params: {
  breakdown: RiskBreakdown;
  edge: EnvIndexedJson['edges'][number];
  env?: { windSpeedMs?: number; weatherRisk01?: number };
}): RiskExplanation {
  const { breakdown, edge, env } = params;

  const bullets: string[] = [];
  const primary: string[] = [];

  if (breakdown.metadata.is_hard_closed || edge.road_open === 0) {
    bullets.push('道路/通行条件为关闭状态（硬性不可通行）。');
    primary.push('road_open');
  }

  // Water crossing warnings
  if (breakdown.components.water > 5) {
    const depth = edge.water_crossing_depth_cm ?? edge.river_crossing_depth_cm;
    const d = typeof depth === 'number' && Number.isFinite(depth) ? Math.round(depth) : undefined;
    bullets.push(
      d !== undefined
        ? `深水预警：该段预计涉水深度约 ${d}cm，普通车辆风险极高，建议改走铺装路或使用高底盘越野车并结伴通行。`
        : '深水预警：该段存在高等级涉水风险，普通车辆风险极高，建议改走铺装路或使用高底盘越野车并结伴通行。',
    );
    primary.push(
      edge.water_crossing_depth_cm !== undefined ? 'water_crossing_depth_cm' : 'river_crossing_depth_cm',
    );
  }

  // Terrain warnings: surface + steepness
  if (breakdown.components.terrain >= 3) {
    const surface = String(edge.surface_type ?? '').toLowerCase();
    const steep = edge.steepness_grade_pct;
    const steepTxt =
      typeof steep === 'number' && Number.isFinite(steep) && steep > 0 ? `（坡度约 ${Math.round(steep)}%）` : '';
    if (surface === 'mud') {
      bullets.push(`抓地力风险：泥泞路面${steepTxt}易打滑/侧滑，不建议单车前往，优先选择替代路线或等待路况改善。`);
      primary.push('surface_type', 'steepness_grade_pct');
    } else if (surface === 'loose_rock') {
      bullets.push(`路面风险：碎石路段${steepTxt}对轮胎与底盘冲击大，建议放慢车速并预留更长冗余时间。`);
      primary.push('surface_type', 'steepness_grade_pct');
    } else if (steepTxt) {
      bullets.push(`地形风险：较大坡度${steepTxt}在不稳定路面/天气下会显著放大失控概率，建议降低密度或改道。`);
      primary.push('steepness_grade_pct');
    }
  }

  // Weather + exposure warnings
  // We treat "weather component" as a proxy; optionally enhance with windSpeedMs.
  const wind = env?.windSpeedMs;
  if (breakdown.components.weather >= 0.8) {
    const windTxt =
      typeof wind === 'number' && Number.isFinite(wind) ? `（观测风速约 ${wind.toFixed(1)}m/s）` : '';
    bullets.push(`强风/暴露风险：该路段暴露度较高${windTxt}，侧风与能见度波动可能导致行驶不稳定，建议保守驾驶并准备备选路线。`);
    primary.push('weatherRisk', 'exposure');
  }

  // F-road label hint
  if (breakdown.components.froad_base >= 0.2) {
    const label = edge.f_road_level != null ? String(edge.f_road_level).toUpperCase() : 'F-road';
    bullets.push(`高地/非铺装提示：该段包含 ${label} 等级路况，建议确认车辆与保险覆盖，并避免在恶劣天气或夜间强行通过。`);
    primary.push('f_road_level');
  }

  // Fall back: at least one sentence for non-trivial risk
  if (bullets.length === 0 && breakdown.total >= 3) {
    bullets.push('该路段综合风险偏高，建议减少高风险航段或提高风险预算并准备备选方案。');
  }

  const primaryFactors = uniqPreserve([
    ...primary,
    // keep a few model-critical factors for traceability
    ...breakdown.metadata.critical_factors.slice(0, 4),
  ]);

  return {
    level: levelFromTotal(breakdown.total),
    bullets: bullets.slice(0, 4),
    primaryFactors,
    riskCost: breakdown.total,
  };
}

