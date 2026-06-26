import type {
  Gate1TrustCard,
  Gate1TrustSurfaceSummary,
  TrustConfidenceLevel,
  TrustDataSource,
  TrustDataSourceKind,
  TrustInterventionEffect,
} from '../types/gate1-trust-surface.types';
import {
  formatInterventionSummaryForTrustSurface,
  parsePlanBInterventionPayload,
  tripInterventionToTrustEffects,
} from '../../trips/causal-runtime/what-if-intervention.builder';
import type { Gate1FulfillmentCausalOutput } from '../../trips/causal-runtime/domains/gate1-fulfillment-causal.types';

const HUMAN_DISCLAIMER =
  '本建议含人工协助成分，不构成实时预订或价格承诺；请以顾问复核与最新数据源为准。';

type CandidateRow = {
  id: string;
  label: string;
  version: number;
  sourceType: string;
  humanMinutes: number | null;
  strategySummary: string;
  constraintSatisfaction: unknown;
  risks: unknown;
  publishedAt: Date | null;
  updatedAt: Date;
};

type PlanBRow = {
  id: string;
  label: string;
  version: number;
  sourceType: string;
  humanMinutes: number | null;
  riskTitle: string;
  alternativeSummary: string;
  triggerCondition: string;
  advisorPreDecision: string;
  triggered: boolean;
  publishedAt: Date | null;
  updatedAt: Date;
  /** Optional JSON payload (`tripnara/plan-b-intervention/v1`) or plain text */
  impactSummary?: string | null;
};

type DecisionRow = {
  id: string;
  selectedCandidateId: string | null;
  adoptedNone: boolean;
  modificationSummary: string | null;
  reasonCodes: unknown;
  submittedAt: Date;
  selectedCandidate: { id: string; label: string; strategySummary: string } | null;
};

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function levelFromScore(score: number | null): TrustConfidenceLevel {
  if (score == null || !Number.isFinite(score)) return 'UNKNOWN';
  if (score >= 0.75) return 'HIGH';
  if (score >= 0.45) return 'MEDIUM';
  return 'LOW';
}

function parseConstraintScore(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === 'object' && raw !== null) {
    const obj = raw as Record<string, unknown>;
    if (typeof obj.score === 'number') return clamp01(obj.score);
    if (Array.isArray(obj.items)) {
      const items = obj.items as Array<{ status?: string; satisfied?: boolean }>;
      if (items.length === 0) return null;
      const ok = items.filter(
        (i) => i.satisfied === true || i.status === 'SATISFIED' || i.status === 'MET',
      ).length;
      return clamp01(ok / items.length);
    }
    if (Array.isArray(obj.constraints)) {
      const items = obj.constraints as Array<{ status?: string }>;
      if (items.length === 0) return null;
      const ok = items.filter((i) => i.status === 'SATISFIED' || i.status === 'MET').length;
      return clamp01(ok / items.length);
    }
  }
  return null;
}

function riskPenalty(risks: unknown): number {
  if (risks == null) return 0;
  if (Array.isArray(risks)) return Math.min(0.35, risks.length * 0.08);
  if (typeof risks === 'object') {
    const keys = Object.keys(risks as object);
    return Math.min(0.35, keys.length * 0.08);
  }
  return 0.1;
}

function sourceKind(sourceType: string): TrustDataSourceKind {
  if (sourceType === 'ADVISOR') return 'ADVISOR';
  if (sourceType === 'HUMAN_ASSISTED') return 'HUMAN_ASSISTED';
  return 'SYSTEM';
}

function humanAssisted(sourceType: string): boolean {
  return sourceType === 'HUMAN_ASSISTED' || sourceType === 'ADVISOR';
}

function iso(d: Date | null | undefined): string {
  return (d ?? new Date()).toISOString();
}

export function scoreCandidateConfidence(c: CandidateRow): { score: number | null; rationale: string } {
  const constraintScore = parseConstraintScore(c.constraintSatisfaction);
  const base = constraintScore ?? (humanAssisted(c.sourceType) ? 0.55 : 0.4);
  const score = clamp01(base - riskPenalty(c.risks));
  const parts: string[] = [];
  if (constraintScore != null) {
    parts.push(`约束满足度 ${Math.round(constraintScore * 100)}%`);
  } else {
    parts.push('约束满足度未结构化标注');
  }
  if (humanAssisted(c.sourceType)) {
    parts.push('含人工协助编制');
  }
  return { score, rationale: parts.join('；') };
}

export function buildCandidateTrustCard(c: CandidateRow, all: CandidateRow[]): Gate1TrustCard {
  const { score, rationale } = scoreCandidateConfidence(c);
  const level = levelFromScore(score);
  const sources: TrustDataSource[] = [
    {
      id: `candidate:${c.id}`,
      label: `${c.label} v${c.version}`,
      kind: sourceKind(c.sourceType),
      freshness: iso(c.publishedAt ?? c.updatedAt),
    },
  ];
  if (c.constraintSatisfaction != null) {
    sources.push({
      id: `constraints:${c.id}`,
      label: '脱敏约束满足摘要',
      kind: 'SANITIZED_CONSTRAINT',
    });
  }

  return {
    cardId: `candidate:${c.id}`,
    subjectType: 'CANDIDATE',
    subjectId: c.id,
    title: c.label,
    confidence: { level, score, rationale },
    alternatives: all
      .filter((x) => x.id !== c.id)
      .map((x) => {
        const alt = scoreCandidateConfidence(x);
        return {
          id: x.id,
          label: x.label,
          summary: x.strategySummary.slice(0, 240),
          confidenceLevel: levelFromScore(alt.score),
        };
      }),
    dataSources: sources,
    machineAesthetic: {
      humanAssisted: humanAssisted(c.sourceType),
      humanMinutes: c.humanMinutes,
      disclaimer: humanAssisted(c.sourceType) ? HUMAN_DISCLAIMER : '系统生成摘要，需顾问复核后对外发布。',
    },
    updatedAt: iso(c.updatedAt),
  };
}

export function buildPlanBTrustCard(
  p: PlanBRow,
  fulfillment?: Gate1FulfillmentCausalOutput | null,
): Gate1TrustCard {
  let score = humanAssisted(p.sourceType) ? 0.6 : 0.45;
  if (p.advisorPreDecision === 'ADOPT') score += 0.15;
  if (p.triggered) score += 0.05;
  score = clamp01(score);

  const interventionPayload = parsePlanBInterventionPayload(p.impactSummary);
  const intervention = interventionPayload?.intervention;
  const projection = interventionPayload?.causalProjection;

  let rationale = p.triggered
    ? 'Plan B 已触发，替代路径经顾问预决策'
    : '预案已发布，触发条件待运行时验证';

  if (intervention) {
    rationale = `${rationale}；${formatInterventionSummaryForTrustSurface(intervention, projection)}`;
  } else if (fulfillment) {
    rationale = `${rationale}；${fulfillment.userFacingAssessment}`;
  }

  const interventionEffects: TrustInterventionEffect[] | undefined = intervention
    ? tripInterventionToTrustEffects(intervention, projection)
    : undefined;

  const alternativeSummary = intervention
    ? formatInterventionSummaryForTrustSurface(intervention, projection)
    : fulfillment?.recommendedIntervention?.action ??
      p.alternativeSummary.slice(0, 240);

  const fulfillmentChain = fulfillment?.causalChain;
  const mergedCausalChain = projection?.causalChain ?? fulfillmentChain;

  return {
    cardId: `planb:${p.id}`,
    subjectType: 'PLAN_B',
    subjectId: p.id,
    title: p.riskTitle || p.label,
    confidence: {
      level: levelFromScore(score),
      score,
      rationale,
    },
    alternatives: [
      {
        id: p.id,
        label: p.label,
        summary: alternativeSummary,
        confidenceLevel: levelFromScore(score),
        interventionSummary: intervention
          ? formatInterventionSummaryForTrustSurface(intervention, projection)
          : undefined,
        interventionEffects,
        causalChain: mergedCausalChain,
      },
    ],
    dataSources: [
      {
        id: `planb:${p.id}`,
        label: p.label,
        kind: sourceKind(p.sourceType),
        freshness: iso(p.publishedAt ?? p.updatedAt),
      },
      {
        id: `trigger:${p.id}`,
        label: '触发条件',
        kind: 'READINESS',
      },
      ...(fulfillment
        ? [
            {
              id: `fulfillment:${p.id}`,
              label: '履约因果评估',
              kind: 'READINESS' as TrustDataSourceKind,
              freshness: iso(p.updatedAt),
            },
          ]
        : []),
    ],
    machineAesthetic: {
      humanAssisted: humanAssisted(p.sourceType),
      humanMinutes: p.humanMinutes,
      disclaimer: HUMAN_DISCLAIMER,
    },
    updatedAt: iso(p.updatedAt),
  };
}

export function buildDecisionTrustCard(
  d: DecisionRow,
  candidates: CandidateRow[],
): Gate1TrustCard {
  const selected = d.selectedCandidate;
  const selectedRow = candidates.find((c) => c.id === d.selectedCandidateId);
  const conf = selectedRow ? scoreCandidateConfidence(selectedRow) : { score: null, rationale: '未选定候选方案' };

  return {
    cardId: `decision:${d.id}`,
    subjectType: 'DECISION',
    subjectId: d.id,
    title: d.adoptedNone ? '顾问决策：暂不采纳候选' : `顾问决策：${selected?.label ?? '待定'}`,
    confidence: {
      level: d.adoptedNone ? 'MEDIUM' : levelFromScore(conf.score),
      score: d.adoptedNone ? 0.5 : conf.score,
      rationale: d.modificationSummary?.slice(0, 200) ?? conf.rationale,
    },
    alternatives: candidates.map((c) => {
      const alt = scoreCandidateConfidence(c);
      return {
        id: c.id,
        label: c.label,
        summary: c.strategySummary.slice(0, 180),
        confidenceLevel: levelFromScore(alt.score),
        isSelected: c.id === d.selectedCandidateId,
      };
    }),
    dataSources: [
      {
        id: `decision:${d.id}`,
        label: '顾问提交决策',
        kind: 'ADVISOR',
        freshness: iso(d.submittedAt),
      },
    ],
    machineAesthetic: {
      humanAssisted: true,
      humanMinutes: null,
      disclaimer: '顾问决策记录，不代表自动执行结果。',
    },
    updatedAt: iso(d.submittedAt),
  };
}

export function summarizeTrustCards(cards: Gate1TrustCard[]): Gate1TrustSurfaceSummary {
  return {
    totalCards: cards.length,
    highConfidenceCount: cards.filter((c) => c.confidence.level === 'HIGH').length,
    humanAssistedCount: cards.filter((c) => c.machineAesthetic.humanAssisted).length,
  };
}
