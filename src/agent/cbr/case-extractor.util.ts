import type { PhysicalConflictAuditReport } from '../utils/terminal-audit-report.generator';
import type { CaseRecord } from './case-record.types';

/**
 * MVP: 将 terminal.audit_report 抽取为可检索的 CaseRecord（gold_sample 优先）。
 * 备注：当前仅做结构打通；真实落库/向量化由后续 pipeline 实现。
 */
export function auditReportToCaseRecord(input: {
  audit_report: PhysicalConflictAuditReport;
  request_id?: string;
}): CaseRecord | undefined {
  const ar = input.audit_report;
  const bg = ar.behavioral_gap;
  const isGold = bg?.is_gold_sample === true;
  if (!isGold) return undefined;

  const conflict_type = (() => {
    // best-effort: infer from early_suggested atoms
    const es = bg?.early_suggested ?? [];
    const reach = es.includes('upgrade_vehicle_to_4wd');
    const scope = es.includes('increase_days_by_1') || es.includes('drop_one_must_include_poi');
    return reach && scope ? 'MIXED' : reach ? 'REACHABILITY' : 'SCOPE';
  })();

  const case_id = `case:${String(bg?.early_warning_id ?? 'unknown')}`;
  const late = bg?.cognitive_gap_accept_late ?? [];
  const p90ms = bg?.wall_hit_distance?.latency_ms;
  const p90span = bg?.wall_hit_distance?.event_span;

  const precedent_summary =
    `判例：在相似${conflict_type}冲突里，用户常会先拒绝建议，最终仍接受【${late.join('、') || '放宽项'}】；` +
    (typeof p90ms === 'number' ? `P90 额外耗时≈${Math.round(p90ms / 1000)}s。` : '');

  // “逻辑子弹”：优先保留有 source / confidence 的证据锚点（取前 5）
  const anchors = (ar.evidence_anchors ?? [])
    .slice()
    .sort((a, b) => {
      const ca = typeof a.confidence === 'number' ? a.confidence : 0;
      const cb = typeof b.confidence === 'number' ? b.confidence : 0;
      return cb - ca;
    })
    .filter((e) => Boolean(e.source || e.evidence_id || e.note))
    .slice(0, 5)
    .map((e) => ({
      evidence_id: e.evidence_id,
      source: e.source,
      note: e.note,
    }));

  return {
    case_id,
    query_signature: {
      conflict_type,
      primary_violation_type: ar.physical_bottleneck?.primary_violation_type,
      relaxation_types: Array.isArray(late) ? late : undefined,
    },
    outcome_payload: {
      historical_late_accept_rate: 1,
      wall_hit_distance_p90_latency_ms: typeof p90ms === 'number' ? p90ms : undefined,
      wall_hit_distance_p90_event_span: typeof p90span === 'number' ? p90span : undefined,
      evidence_anchors: anchors,
    },
    precedent_summary,
    provenance: {
      early_warning_id: bg?.early_warning_id,
      request_id: input.request_id,
      generated_at: new Date().toISOString(),
    },
  };
}

