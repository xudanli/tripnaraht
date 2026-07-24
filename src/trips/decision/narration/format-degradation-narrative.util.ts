/**
 * 优化降级 → 用户可读中文（诚实门控；数值 SSOT 来自 OptimizationHints）。
 */

import type { OptimizationHints } from '../../../decision/kernel/decision-state.types';

function fallbackReasonZh(step: string, reason: string): string {
  const key = `${step}:${reason}`.toLowerCase();
  if (key.includes('cgus_gate') || key.includes('cgus_returned')) {
    return 'CGUS 约束搜索未就绪，已切换备用优化路径';
  }
  if (key.includes('monte_carlo') || key.includes('mc_gate')) {
    return '蒙特卡洛不确定性源不足或采样失败';
  }
  if (key.includes('physical') || key.includes('dem')) {
    return '物理/DEM 证据不完整';
  }
  if (key.includes('weather') || key.includes('meteo')) {
    return '气象或路况实时数据断联';
  }
  return reason || step;
}

export function buildDegradationHeadlineZh(hints: OptimizationHints): string | undefined {
  if (hints.method !== 'HEURISTIC' && hints.method !== 'MONTE_CARLO') {
    const chain = hints.decisionVerdict?.fallback_chain;
    if (!chain?.length) return undefined;
  }

  const parts: string[] = [];

  if (hints.method === 'HEURISTIC') {
    parts.push(
      '由于部分物理不确定性源暂不可用，系统已自动安全降级为【经典专家经验模型】进行排序与提示。',
    );
  } else if (hints.method === 'MONTE_CARLO') {
    parts.push('当前采用【蒙特卡洛抽样】评估方案可行性；若抽样预算不足，结论置信度会相应降低。');
  }

  for (const fb of hints.decisionVerdict?.fallback_chain?.slice(0, 3) ?? []) {
    parts.push(fallbackReasonZh(fb.step, fb.reason));
  }

  if (hints.optimizationFlags?.freezeRouteSelection || hints.optimizationFlags?.physicalRealityIncomplete) {
    parts.push(
      'Decision OS 已主动锁定当前路线拓扑（Topology Lock），优先保障可执行性与安全，而非探索高风险分支。',
    );
  }

  const roads = hints.worldConstraintMaterialization?.roadIds?.filter(Boolean) ?? [];
  if (roads.length) {
    parts.push(`路政约束已物化：${roads.slice(0, 3).join('、')}。`);
  }

  return parts.length ? parts.join('') : undefined;
}

export function buildDegradationSummaryLine(hints: OptimizationHints): string | undefined {
  const headline = buildDegradationHeadlineZh(hints);
  if (!headline) return undefined;
  return `[系统降级说明] ${headline}`.slice(0, 500);
}
