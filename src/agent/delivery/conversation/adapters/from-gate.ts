import type {
  ConversationActionV1,
  GateRiskCardV1,
} from '../conversation-turn-result.types';

export type GateAssembleSource = {
  gate_result?: string | null;
  conclusion_zh?: string | null;
  rationale_zh?: string | null;
  alternatives_zh?: string[];
  affected_date_iso?: string;
  answer_text?: string;
  violations_count?: number;
  has_hard?: boolean;
  safetravel_alerts_zh?: string[];
};

/**
 * Gate / 执行风险 → gate_risk 卡（结论优先）。
 * 禁止仅凭 answer_text 生成 gate_risk（否则 DATA_LOOKUP / day_view 会被误标成执行建议）。
 */
export function adaptGateRiskFromGate(
  src: GateAssembleSource,
): { card: GateRiskCardV1; actions: ConversationActionV1[] } | null {
  const gate = String(src.gate_result ?? '').toUpperCase();
  const conclusionExplicit = String(src.conclusion_zh ?? '').trim();
  const hasExplicitGate =
    Boolean(conclusionExplicit) ||
    gate === 'BLOCK' ||
    gate === 'BLOCKED' ||
    gate === 'ADJUST_REQUIRED' ||
    (src.violations_count ?? 0) > 0 ||
    (src.safetravel_alerts_zh?.length ?? 0) > 0;

  if (!hasExplicitGate) return null;

  const conclusion =
    conclusionExplicit ||
    (gate === 'BLOCK' || gate === 'BLOCKED'
      ? '当前方案存在硬风险，建议确认后再执行。'
      : gate === 'ADJUST_REQUIRED'
        ? '建议调整后再继续。'
        : String(src.answer_text ?? '').trim());

  if (!conclusion) return null;

  let severity: GateRiskCardV1['severity'] = 'info';
  if (src.has_hard || gate === 'BLOCK' || gate === 'BLOCKED') severity = 'hard';
  else if (gate === 'ADJUST_REQUIRED') severity = 'soft';

  const alternatives = [
    ...(src.alternatives_zh ?? []),
    ...(src.safetravel_alerts_zh ?? []),
  ].filter((s) => String(s).trim());

  const card: GateRiskCardV1 = {
    kind: 'gate_risk',
    title_zh: severity === 'hard' ? '风险阻断' : '执行建议',
    conclusion_zh: conclusion || '请查看相关风险提示。',
    ...(src.rationale_zh ? { rationale_zh: src.rationale_zh } : {}),
    severity,
    ...(alternatives.length ? { alternatives_zh: alternatives.slice(0, 5) } : {}),
    ...(src.affected_date_iso
      ? { affected_date_iso: src.affected_date_iso.slice(0, 10) }
      : {}),
  };

  return { card, actions: [] };
}
