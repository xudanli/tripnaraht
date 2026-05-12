import { Injectable } from '@nestjs/common';
import { NEGOTIATION_REASONING_TAG } from '../constants/negotiation-reasoning.constants';

function clampText(s: string): string {
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}

function optionLabel(a: any): string {
  const id = String(a?.id ?? '').toUpperCase();
  if (id === 'UPGRADE_TO_DRIVE') return '打车升级';
  if (id === 'POSTPONE_SCHEDULE') {
    const m = Number(a?.time_delta_minutes);
    const mm = Number.isFinite(m) && m > 0 ? Math.round(m) : 0;
    return mm > 0 ? `推迟 ${mm} 分钟` : '推迟行程';
  }
  const msg = clampText(a?.message ?? '');
  return msg ? msg : String(a?.id ?? '备选方案');
}

function hasTag(a: any, tag: string): boolean {
  return Array.isArray(a?.reasoning_tags) && a.reasoning_tags.includes(tag);
}

@Injectable()
export class NegotiationNarratorService {
  /**
   * Produce a one-line, “counselor voice” recommendation summary.
   * Input alternatives are assumed ordered by recommendation (best first).
   */
  summarize(params: { alternatives: any[] | undefined | null; strategy_impact_map?: any }): string | undefined {
    const alts = Array.isArray(params.alternatives) ? params.alternatives.filter(Boolean) : [];
    if (alts.length < 2) return undefined;

    const top1 = alts[0];
    const top2 = alts[1];
    const a = optionLabel(top1);
    const b = optionLabel(top2);

    const reasons: string[] = [];

    // Prefer explaining why we *avoid* the runner-up, using high-signal tags.
    if (hasTag(top2, NEGOTIATION_REASONING_TAG.REAL_TIME_RISK_WARNING)) {
      reasons.push('它会显著挤压后续容错，准点风险更高');
    }
    if (hasTag(top2, NEGOTIATION_REASONING_TAG.ROLLBACK_MEMORY)) {
      reasons.push('你近期曾回滚过类似选择，系统不建议再次冒险');
    }
    if (hasTag(top2, NEGOTIATION_REASONING_TAG.TAILORED_TO_YOUR_PREFERENCE)) {
      reasons.push('它也更可能违背你以往在类似情况下的选择偏好');
    }

    const e1 = Number(top1?.effort_delta);
    const e2 = Number(top2?.effort_delta);
    if ((!reasons.length || reasons.length < 2) && Number.isFinite(e1) && Number.isFinite(e2) && e2 > e1) {
      reasons.push('综合权衡成本、时间与风险后，它的性价比更低');
    }

    const tail =
      reasons.length > 0
        ? `虽然[${b}]也能解决冲突，但${reasons.join('，')}。`
        : `虽然[${b}]也能解决冲突，但综合权衡后我们仍更建议选择更稳妥的方案。`;

    const hz = params.strategy_impact_map?.heat_zones;
    const hasBottleneck = Array.isArray(hz) && hz.some((z: any) => z?.bottleneck_node);
    const bottleneckHint = hasBottleneck ? '另：行程存在“物理瓶颈”节点（各方案都缺乏缓冲），建议主动增加 Buffer 或删减项目。' : '';

    return `我们更推荐[${a}]。${tail}${bottleneckHint ? ' ' + bottleneckHint : ''}`;
  }
}

