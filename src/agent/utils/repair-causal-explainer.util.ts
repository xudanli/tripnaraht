import type { SimulatedRepairTrace } from '../services/route-feasibility.types';

export interface RepairTacticSignature {
  at?: string;
  constraintId?: string;
  tacticId?: string;
}

export type RepairTraceLite = {
  tacticId: string;
  applied: boolean;
  reason: string;
  targetEntity?: { type?: string; id?: string };
  metrics?: {
    fatigue_score01?: number;
    fatigue_weight?: number;
    base_limit?: number;
    effective_limit?: number;
    actual_cost?: number;
    unit?: string;
  };
  evidence?: { path_fingerprint?: string; refIds?: string[] };
  simulation?: { kind: string; boundary_id?: string };
};

export function simulatedTracesToLite(traces: SimulatedRepairTrace[]): RepairTraceLite[] {
  return traces.map((t) => ({
    tacticId: t.tacticId,
    applied: t.applied,
    reason: String(t.reason),
    targetEntity: t.targetEntity,
    metrics: t.metrics,
    evidence: t.evidence,
    simulation: t.simulation,
  }));
}

export function formatPredictiveFailureReport(traces: SimulatedRepairTrace[]): string {
  return formatRepairDeadlockAudit({
    mode: 'predictive',
    moveCount: 0,
    itemId: 'INTAKE',
    signatures: [],
    repairTraces: simulatedTracesToLite(traces),
  });
}

function formatPredictiveTraceLine(t: RepairTraceLite): string {
  if (t.tacticId === 'UserDynamicBoundary') {
    const f = typeof t.metrics?.fatigue_score01 === 'number' ? t.metrics.fatigue_score01 : undefined;
    const avg = typeof t.metrics?.actual_cost === 'number' ? t.metrics.actual_cost : undefined;
    const unit = String(t.metrics?.unit ?? '');
    const rid = (t.evidence?.refIds ?? [])[0];
    if (f != null && avg != null) {
      return `个性化生理红线（会话动态边界）：基于您在本会话中的历史修复轨迹（${String(
        rid ?? 'SESSION_HISTORY',
      )}），当前强度下界约 ${avg}${unit}/day 与 f=${f.toFixed(2)} 的组合，将高概率再次触发 ${String(t.reason)}。`;
    }
    return `个性化生理红线（会话动态边界）：${String(t.reason)}（${String(rid ?? 'SESSION_HISTORY')}）。`;
  }
  if (t.tacticId !== 'IntakePredictiveSimulator') return '';
  const bid = String(t.simulation?.boundary_id ?? '');
  const f = typeof t.metrics?.fatigue_score01 === 'number' ? t.metrics.fatigue_score01 : undefined;
  const w = typeof t.metrics?.fatigue_weight === 'number' ? t.metrics.fatigue_weight : undefined;
  const actual = typeof t.metrics?.actual_cost === 'number' ? t.metrics.actual_cost : undefined;
  const eff = typeof t.metrics?.effective_limit === 'number' ? t.metrics.effective_limit : undefined;
  const base = typeof t.metrics?.base_limit === 'number' ? t.metrics.base_limit : undefined;
  const unit = String(t.metrics?.unit ?? '');
  const reason = String(t.reason ?? '');
  if (bid === 'fatigue_high_risk' && f != null && actual != null && eff != null && base != null) {
    return `推演命中【${bid}】：reason=${reason}；预估日均驾驶负荷 actual≈${actual}${unit}（历史边界 base=${base}${unit}）；生理映射 f=${f.toFixed(
      2,
    )}、w(f)=${(w ?? 0).toFixed(3)}。`;
  }
  if (bid === 'terrain_high_risk') {
    return `推演命中【${bid}】：reason=${reason}（2WD 与 F-road/高地准入的历史不相容）。`;
  }
  return `推演命中【${bid || 'unknown'}】：reason=${reason}。`;
}

/**
 * 将 tactic 签名链翻译为“因果循环审计”文本（v0）
 * - predictive：INTAKE 侧“虚拟撞墙”叙事（消费 RepairTrace / SimulatedRepairTrace 的 lite 投影）
 * - deadlock：REPAIR 振荡熔断叙事
 */
export function formatRepairDeadlockAudit(params: {
  mode?: 'deadlock' | 'predictive';
  moveCount: number;
  itemId: string;
  signatures: RepairTacticSignature[];
  repairTraces?: RepairTraceLite[];
  maxSteps?: number;
}): string {
  const mode = params.mode ?? 'deadlock';
  const { moveCount, itemId } = params;
  const maxSteps = typeof params.maxSteps === 'number' && params.maxSteps > 0 ? params.maxSteps : 5;
  const sigs = Array.isArray(params.signatures) ? params.signatures : [];
  const traces = Array.isArray(params.repairTraces) ? params.repairTraces : [];

  const chain = sigs
    .slice(-maxSteps)
    .map((s) => `【${String(s.constraintId ?? '?')}】:${String(s.tacticId ?? '?')}`)
    .join(' → ');

  const head =
    mode === 'predictive'
      ? `【预判式失败审计（PREDICTIVE_FAILURE_REPORT）】根据历史边界与形式化规则推演：当前意图在未生成行程前即存在高概率进入 VERIFY↔REPAIR 回溯。`
      : `【逻辑死结审计】系统尝试了 ${moveCount} 次自动修复，但在同一节点（${itemId}）上出现反复改写。`;
  const body = mode === 'deadlock' && chain ? `\n因果链（最近 ${Math.min(maxSteps, sigs.length)} 步）：${chain}。` : '';
  const hasGeo =
    sigs.some((s) => String(s.constraintId ?? '').startsWith('terrain.')) ||
    sigs.some((s) => String(s.tacticId ?? '').toLowerCase().includes('reroutetactic'));
  const geoLine =
    mode === 'deadlock' && hasGeo
      ? '\n观察：出现地理维度的冲突。系统尝试通过【重选路由（RerouteTactic）】避开陡坡/风险路段，但新路径带来的 ETA/里程增量又可能触发【驾驶时长】或【时间缓冲】约束，导致回溯与振荡。'
      : '';

  const traceLine = (() => {
    if (mode === 'predictive') {
      const lines = traces.map(formatPredictiveTraceLine).filter(Boolean);
      return lines.length ? `\n定损（L3 仿真 trace）：\n${lines.join('\n')}` : '';
    }
    const last = traces.slice().reverse().find((t) => String(t?.tacticId ?? '') === 'TerrainRerouteTactic');
    if (!last) return '';
    const f = typeof last.metrics?.fatigue_score01 === 'number' ? last.metrics.fatigue_score01 : undefined;
    const eff = typeof last.metrics?.effective_limit === 'number' ? last.metrics.effective_limit : undefined;
    const cost = typeof last.metrics?.actual_cost === 'number' ? last.metrics.actual_cost : undefined;
    const unit = String(last.metrics?.unit ?? 'min');
    const reason = String(last.reason ?? '');
    if (f == null || eff == null || cost == null) {
      return `\n定损（trace）：RerouteTactic reason=${reason} applied=${String(last.applied)}。`;
    }
    return `\n定损（L3 trace）：系统尝试地理绕路，预估增加 ${cost}${unit}；由于当前疲劳 f=${f.toFixed(
      2,
    )}，容忍阈值被压制到 ${Math.round(eff)}${unit}，因此本次修复被判定为 ${reason}。`;
  })();

  const tail =
    mode === 'predictive'
      ? '\n结论：这是“来自未来的审计报告”。建议您在进入 POI/排程前先收紧可行域（天数/车辆/必去点），以避免后续高成本回溯。'
      : '\n结论：当前约束组合可能存在死结（Deadlock）。建议您进行高阶放宽（例如：增加天数/减少必去点/降低强度/更换交通方式），否则系统无法保证收敛。';
  return `${head}${body}${geoLine}${traceLine}${tail}`.slice(0, 1200);
}
