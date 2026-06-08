/**
 * unified-explainability@v1 → decision.explainForHuman 确定性投影（无 LLM）。
 */

import type { WorldModelContext } from '../shared/world-model.types';
import type {
  UnifiedExplainabilityEnvelopeV1,
  UnifiedGroundedFactorV1,
} from './unified-explainability.types';

export interface ExplainForHumanProjection {
  userFacingNarrative: {
    abuSection: string;
    drdreSection: string;
    neptuneSection: string;
  };
  riskHighlights: Array<{
    risk: string;
    severity: 'high' | 'medium' | 'low';
    explanation: string;
    reason_codes?: string[];
    evidence_refs?: string[];
    anchored_factor_ids?: string[];
  }>;
  tradeOffs: Array<{
    what: string;
    why: string;
    impact: string;
    reason_codes?: string[];
    evidence_refs?: string[];
  }>;
  explanation: string;
  summary: string;
  keyPoints: Array<{ point: string; category: string }>;
}

const REASON_LABEL_ZH: Record<string, string> = {
  WORLD_ROAD_CLOSED: '道路封闭或不可通行',
  SPATIAL_REPAIR: '空间修复以规避不可行路段',
  MIN_EDIT: '最小改动原则',
  READINESS_BLOCK: '准备度检查未通过',
  READINESS_MUST_ADJUST: '准备度要求调整行程',
  PACE_BUFFER: '节奏缓冲',
  DEM_VIOLATION: '地形/DEM 安全约束',
};

function labelReasonCodes(codes: string[]): string {
  if (codes.length === 0) return '系统记录未标注具体原因码';
  return codes.map((c) => REASON_LABEL_ZH[c] ?? c).join('；');
}

function logsByPersona(envelope: UnifiedExplainabilityEnvelopeV1, persona: string) {
  return envelope.decision_trace.filter((t) => t.persona === persona);
}

function narrativeForPersona(
  persona: 'ABU' | 'DR_DRE' | 'NEPTUNE',
  logs: UnifiedExplainabilityEnvelopeV1['decision_trace'],
  world?: WorldModelContext,
): string {
  const empty = {
    ABU: '安全守护者 Abu 检查了行程，未发现安全隐患。',
    DR_DRE: '节奏调节者 Dr.Dre 检查了行程节奏，认为当前安排合理。',
    NEPTUNE: '路线守护者 Neptune 检查了路线完整性，所有路段均可用。',
  } as const;

  if (logs.length === 0) return empty[persona];

  const rejectOrBlock = logs.filter((l) => l.action === 'REJECT');
  const adjust = logs.filter((l) => l.action === 'ADJUST');
  const replace = logs.filter((l) => l.action === 'REPLACE');

  if (persona === 'ABU') {
    if (rejectOrBlock.length > 0) {
      const parts = rejectOrBlock.map(
        (l) => `${l.explanation}（依据：${labelReasonCodes(l.reason_codes)}）`,
      );
      return `安全守护者 Abu 发现安全隐患：${parts.join('、')}。相关证据引用：${rejectOrBlock.flatMap((l) => l.evidence_refs).join(', ') || '见决策 trace'}。`;
    }
    return '安全守护者 Abu 检查了行程的所有路段，确认计划安全可行。';
  }

  if (persona === 'DR_DRE') {
    if (adjust.length > 0) {
      const parts = adjust.map(
        (l) => `${l.explanation}（${labelReasonCodes(l.reason_codes)}）`,
      );
      return `节奏调节者 Dr.Dre 优化了行程节奏：${parts.join('、')}。`;
    }
    return empty.DR_DRE;
  }

  if (replace.length > 0) {
    const parts = replace.map((l) => `${l.explanation}（${labelReasonCodes(l.reason_codes)}）`);
    const philosophyNote = world?.routeDirection?.name
      ? `我们保持了「${world.routeDirection.name}」路线的核心风格`
      : '我们保持了路线的核心风格';
    return `路线守护者 Neptune 替换了不可用的路段：${parts.join('、')}。${philosophyNote}。`;
  }
  return empty.NEPTUNE;
}

function severityFromFactor(f: UnifiedGroundedFactorV1): 'high' | 'medium' | 'low' {
  if (f.severity === 'BLOCK') return 'high';
  if (f.severity === 'WARN') return 'medium';
  return 'low';
}

export function projectExplainForHumanFromEnvelope(
  envelope: UnifiedExplainabilityEnvelopeV1,
  world?: WorldModelContext,
): ExplainForHumanProjection {
  const abuLogs = logsByPersona(envelope, 'ABU');
  const drLogs = logsByPersona(envelope, 'DR_DRE');
  const nepLogs = logsByPersona(envelope, 'NEPTUNE');

  const userFacingNarrative = {
    abuSection: narrativeForPersona('ABU', abuLogs, world),
    drdreSection: narrativeForPersona('DR_DRE', drLogs, world),
    neptuneSection: narrativeForPersona('NEPTUNE', nepLogs, world),
  };

  const riskHighlights = envelope.grounded_factors
    .filter((f) => f.severity === 'BLOCK' || f.severity === 'WARN')
    .slice(0, 5)
    .map((f) => {
      const anchoredLogs = f.anchor_log_indices.map((i) => envelope.decision_trace[i]).filter(Boolean);
      return {
        risk: f.rejection_reason ?? anchoredLogs[0]?.explanation ?? f.factor_id,
        severity: severityFromFactor(f),
        explanation: f.rejection_reason ?? anchoredLogs[0]?.explanation ?? f.factor_id,
        reason_codes: anchoredLogs.flatMap((l) => l.reason_codes),
        evidence_refs: f.anchor_evidence_refs,
        anchored_factor_ids: [f.factor_id],
      };
    });

  const tradeOffs = envelope.decision_trace
    .filter((t) => t.action === 'ADJUST' || t.action === 'REPLACE')
    .map((t) => ({
      what: t.explanation,
      why: labelReasonCodes(t.reason_codes),
      impact:
        t.action === 'REPLACE'
          ? '替换为风格相近的可行路段，保持路线哲学'
          : '调整节奏与缓冲，降低疲劳与超时风险',
      reason_codes: t.reason_codes,
      evidence_refs: t.evidence_refs,
    }));

  const explanation = [
    userFacingNarrative.abuSection,
    userFacingNarrative.drdreSection,
    userFacingNarrative.neptuneSection,
  ].join('\n\n');

  const summary = `本次决策共 ${envelope.decision_trace.length} 条 trace，${riskHighlights.length} 个风险因子，${tradeOffs.length} 项取舍；完整性：traceability=${envelope.integrity.traceability_valid}，physical_evidence=${envelope.integrity.physical_evidence_complete}。`;

  const keyPoints = riskHighlights.map((rh) => ({
    point: rh.explanation,
    category: rh.severity,
  }));

  return {
    userFacingNarrative,
    riskHighlights,
    tradeOffs,
    explanation,
    summary,
    keyPoints,
  };
}

export function buildDeterministicNarrativeFromEnvelope(
  envelope: UnifiedExplainabilityEnvelopeV1,
  world?: WorldModelContext,
): UnifiedExplainabilityEnvelopeV1['narrative'] {
  const projection = projectExplainForHumanFromEnvelope(envelope, world);
  const factorIds = envelope.grounded_factors.map((f) => f.factor_id);
  return {
    locale: 'zh',
    mode: 'deterministic',
    sections: [
      {
        persona: 'ABU',
        headline: '安全门控',
        body: projection.userFacingNarrative.abuSection,
        anchored_factor_ids: factorIds.slice(0, 3),
      },
      {
        persona: 'DR_DRE',
        headline: '节奏调节',
        body: projection.userFacingNarrative.drdreSection,
        anchored_factor_ids: factorIds.slice(0, 3),
      },
      {
        persona: 'NEPTUNE',
        headline: '空间修复',
        body: projection.userFacingNarrative.neptuneSection,
        anchored_factor_ids: factorIds.slice(0, 3),
      },
    ],
  };
}
