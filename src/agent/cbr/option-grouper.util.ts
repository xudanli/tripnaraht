import type { RelaxationActionId, ScoreBreakdown } from './constraint-scorer.util';

export interface ScoredOption {
  value: RelaxationActionId;
  label: string;
  breakdown: ScoreBreakdown;
}

export interface GroupedOptions {
  pathA: ScoredOption[]; // 物理必经点 / 可达性意义上的最小割集
  pathB: ScoredOption[]; // 资源平衡 / 精简路径
  other: ScoredOption[];
}

export function groupMinCutPaths(input: {
  dominant_cid?: string;
  is_hard?: boolean;
  options: ScoredOption[];
}): GroupedOptions {
  const dom = String(input.dominant_cid ?? '');
  const hard = input.is_hard === true || /HARD|ADMISS|REACHABILITY/i.test(dom);
  const out: GroupedOptions = { pathA: [], pathB: [], other: [] };
  for (const o of input.options) {
    if (o.value === 'accept_no_solution' || o.value === 'manual_relax_constraints') {
      out.other.push(o);
      continue;
    }
    if (hard) {
      // 路径 A：直接解决可接纳性 / 可达性的动作
      if (o.value === 'upgrade_vehicle_to_4wd' || o.value === 'drop_one_must_include_poi') {
        out.pathA.push(o);
        continue;
      }
      //路径 B：范围/时间/预算类动作
      if (o.value === 'increase_days_by_1') {
        out.pathB.push(o);
        continue;
      }
    } else {
      // 非硬性分类：按“资源”与“范围”进行分组
      if (o.value === 'increase_days_by_1') out.pathB.push(o);
      else out.pathA.push(o);
      continue;
    }
    out.other.push(o);
  }
  return out;
}

