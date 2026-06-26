import type { NegotiationResult } from '../../decision/optimization/learning/guardian-persona.interface';
import type { Prisma } from '@prisma/client';
import type {
  ReadinessGuardianNegotiationSnapshot,
  ReadinessGuardianNegotiationSummary,
  ReadinessGuardianPersonaSummary,
  RepairOptionsGuardianConsensus,
  RepairOptionsGuardianNegotiationView,
  RepairOptionsGuardianPersonaView,
  RepairOptionsGuardianStance,
} from '../types/coverage-map.types';
import { buildGuardianRepairHints } from '../../decision/repair/guardian-repair-hints.util';
import type { GuardianRepairHints } from '../../decision/repair/guardian-repair-hints.types';
import { buildPersonaPresentation } from '../../../agent/services/persona-lead-speaker.util';
import type { GuardianPersonaPresentation } from '../../decision/shared/guardian-presentation.types';

export const READINESS_GUARDIAN_NEGOTIATION_METADATA_KEY = 'readinessGuardianNegotiation';

/** pre_repair 为 REJECT 且共识低于此值时，apply-repair 不自动执行 Neptune 修复 */
export const GUARDIAN_LOW_CONSENSUS_DEFER_THRESHOLD = 0.4;

const PERSONA_LABELS: Record<string, string> = {
  ABU: '守护者',
  DRE: '节奏师',
  NEPTUNE: '哲学家',
};

export function isReadinessGuardianNegotiationEnabled(): boolean {
  const raw = process.env.READINESS_GUARDIAN_NEGOTIATION;
  if (raw === undefined || raw === '') return true;
  return !['0', 'false', 'off', 'no'].includes(raw.toLowerCase());
}

export function mapNegotiationResultToSummary(
  result: NegotiationResult,
  context: {
    phase: ReadinessGuardianNegotiationSummary['phase'];
    tripId: string;
    repairActionType?: string;
    blockerId?: string;
  },
): ReadinessGuardianNegotiationSummary {
  return {
    phase: context.phase,
    tripId: context.tripId,
    repairActionType: context.repairActionType,
    blockerId: context.blockerId,
    decision: result.decision,
    consensusLevel: result.consensusLevel ?? 0,
    humanDecisionPoints: result.humanDecisionPoints ?? [],
    conditions: result.conditions ?? [],
    keyTradeoffs: result.keyTradeoffs ?? [],
    summary: result.summary ?? '',
    debateRoundCount: result.debateRounds?.length ?? 0,
    suggestedAdjustments: (result.evaluations ?? []).flatMap(
      (evaluation) => evaluation.suggestedAdjustments ?? [],
    ),
    personaEvaluations: (result.evaluations ?? []).map((evaluation) => ({
      persona: evaluation.persona,
      personaLabel: PERSONA_LABELS[evaluation.persona] ?? evaluation.persona,
      stance: evaluation.stance,
      utility: evaluation.utility ?? 0,
      primaryConcerns: evaluation.primaryConcerns ?? [],
    })),
    fatiguePrediction: result.fatiguePrediction,
    negotiatedAt: new Date().toISOString(),
  };
}

export function extractGuardianNegotiationSnapshot(
  metadata: unknown,
): ReadinessGuardianNegotiationSnapshot | undefined {
  if (!metadata || typeof metadata !== 'object') return undefined;
  const raw = (metadata as Record<string, unknown>)[READINESS_GUARDIAN_NEGOTIATION_METADATA_KEY];
  if (!raw || typeof raw !== 'object') return undefined;
  return raw as ReadinessGuardianNegotiationSnapshot;
}

export function mergeGuardianNegotiationSnapshot(
  metadata: unknown,
  snapshot: ReadinessGuardianNegotiationSnapshot,
): Prisma.InputJsonValue {
  const base =
    metadata && typeof metadata === 'object'
      ? { ...(metadata as Record<string, unknown>) }
      : {};
  base[READINESS_GUARDIAN_NEGOTIATION_METADATA_KEY] = snapshot;
  return base as unknown as Prisma.InputJsonValue;
}

export function shouldDeferRepairByPreNegotiation(
  preRepair: ReadinessGuardianNegotiationSummary | undefined,
): boolean {
  if (!preRepair) return false;
  return (
    preRepair.decision === 'REJECT' &&
    preRepair.consensusLevel < GUARDIAN_LOW_CONSENSUS_DEFER_THRESHOLD
  );
}

export function buildGuardianDeferMessage(
  preRepair: ReadinessGuardianNegotiationSummary,
): string {
  const pct = Math.round(preRepair.consensusLevel * 100);
  const points = preRepair.humanDecisionPoints?.slice(0, 2).join('；');
  const base = `三人格协商拒绝自动修复（共识 ${pct}%）：${preRepair.summary || '请先确认关键风险'}`;
  return points ? `${base}。待确认：${points}` : base;
}

export function buildGuardianRepairHintsFromSummary(
  summary: ReadinessGuardianNegotiationSummary | undefined,
): GuardianRepairHints | undefined {
  if (!summary) return undefined;

  const personaByText: Record<string, 'ABU' | 'DRE' | 'NEPTUNE'> = {};
  for (const evaluation of summary.personaEvaluations ?? []) {
    for (const text of [
      ...(evaluation.primaryConcerns ?? []),
    ]) {
      const trimmed = String(text).trim();
      if (trimmed) personaByText[trimmed] = evaluation.persona;
    }
  }

  const suggestedAdjustments = [
    ...(summary.suggestedAdjustments ?? []),
    ...(summary.personaEvaluations ?? []).flatMap(
      (evaluation) => evaluation.primaryConcerns ?? [],
    ),
  ];

  return buildGuardianRepairHints({
    decision: summary.decision,
    consensusLevel: summary.consensusLevel,
    conditions: summary.conditions,
    suggestedAdjustments,
    humanDecisionPoints: summary.humanDecisionPoints,
    keyTradeoffs: summary.keyTradeoffs,
    sourcePhase: summary.phase,
    negotiatedAt: summary.negotiatedAt,
    personaByText,
    fatiguePrediction: summary.fatiguePrediction,
  });
}

export function pickGuardianSummaryForBlocker(
  snapshot: ReadinessGuardianNegotiationSnapshot | undefined,
  blockerId: string,
): ReadinessGuardianNegotiationSummary | undefined {
  if (!snapshot) return undefined;
  if (snapshot.preRepair?.blockerId === blockerId) return snapshot.preRepair;
  if (snapshot.latest?.blockerId === blockerId) return snapshot.latest;
  if (snapshot.preRepair) return snapshot.preRepair;
  return snapshot.latest;
}

function mapGuardianPersonaCode(
  persona: ReadinessGuardianPersonaSummary['persona'],
): RepairOptionsGuardianPersonaView['persona'] {
  return persona === 'DRE' ? 'DR_DRE' : persona;
}

function mapGuardianStance(stance: string): RepairOptionsGuardianStance {
  if (stance === 'STRONG_SUPPORT' || stance === 'SUPPORT') return 'SUPPORT';
  if (stance === 'STRONG_OPPOSE') return 'OPPOSE';
  if (stance === 'CONCERN') return 'CAUTION';
  return 'NEUTRAL';
}

function buildGuardianPersonaMessage(evaluation: ReadinessGuardianPersonaSummary): string {
  const concern = evaluation.primaryConcerns?.find((item) => String(item).trim());
  if (concern) return String(concern).trim();
  const stance = mapGuardianStance(evaluation.stance);
  const stanceText: Record<RepairOptionsGuardianStance, string> = {
    SUPPORT: '支持当前修复方向',
    CAUTION: '对修复方案存有顾虑',
    OPPOSE: '不建议按此方案修复',
    NEUTRAL: '需进一步权衡',
  };
  return `${evaluation.personaLabel}：${stanceText[stance]}`;
}

export function mapRepairOptionsGuardianConsensus(
  summary: ReadinessGuardianNegotiationSummary,
): RepairOptionsGuardianConsensus {
  if (
    summary.decision === 'REJECT' ||
    summary.consensusLevel < GUARDIAN_LOW_CONSENSUS_DEFER_THRESHOLD
  ) {
    return 'BLOCKED';
  }
  if (summary.decision === 'APPROVE' && summary.consensusLevel >= 0.7) {
    return 'ALIGNED';
  }
  return 'SPLIT';
}

/** 将三人格博弈摘要映射为 repair-options 前端 Guardian 面板契约 */
export function mapSummaryToRepairOptionsGuardianNegotiation(
  summary: ReadinessGuardianNegotiationSummary,
): RepairOptionsGuardianNegotiationView {
  const personas: RepairOptionsGuardianPersonaView[] = (summary.personaEvaluations ?? []).map(
    (evaluation) => {
      const highlights = (evaluation.primaryConcerns ?? [])
        .map((item) => String(item).trim())
        .filter(Boolean)
        .slice(0, 3);
      const suggestion =
        summary.suggestedAdjustments?.find((item) =>
          highlights.some((highlight) => String(item).includes(highlight)),
        ) ??
        summary.suggestedAdjustments?.[0] ??
        highlights[1];

      return {
        persona: mapGuardianPersonaCode(evaluation.persona),
        stance: mapGuardianStance(evaluation.stance),
        message: buildGuardianPersonaMessage(evaluation),
        suggestion: suggestion ? String(suggestion) : undefined,
        highlights: highlights.length ? highlights : undefined,
      };
    },
  );

  const userActionRequired = [
    ...(summary.humanDecisionPoints ?? []),
    ...(summary.conditions ?? []),
  ]
    .map((item) => String(item).trim())
    .filter(Boolean);

  return {
    consensus: mapRepairOptionsGuardianConsensus(summary),
    summary: summary.summary || undefined,
    personas,
    userActionRequired: userActionRequired.length ? userActionRequired : undefined,
    analyzedAt: summary.negotiatedAt,
  };
}

function readinessStanceToVerdict(
  stance: string,
  persona: 'ABU' | 'DR_DRE' | 'NEPTUNE',
): 'ALLOW' | 'ADJUST' | 'REPLACE' | 'REJECT' | 'NEED_CONFIRM' {
  if (stance === 'STRONG_OPPOSE') return persona === 'ABU' ? 'REJECT' : 'ADJUST';
  if (stance === 'CONCERN') return 'NEED_CONFIRM';
  return 'ALLOW';
}

function mapReadinessPersonaToPresentationSlice(
  evaluation: ReadinessGuardianPersonaSummary | undefined,
  persona: 'ABU' | 'DR_DRE' | 'NEPTUNE',
) {
  if (!evaluation) return null;
  const icons = { ABU: '🐻', DR_DRE: '🐕', NEPTUNE: '🦦' };
  const names = { ABU: 'Abu', DR_DRE: 'Dr.Dre', NEPTUNE: 'Neptune' };
  return {
    persona,
    icon: icons[persona],
    name: names[persona],
    verdict: readinessStanceToVerdict(evaluation.stance, persona),
    explanation:
      evaluation.primaryConcerns?.[0] ??
      buildGuardianPersonaMessage(evaluation),
  };
}

/** pre/post repair 博弈摘要 → Persona Expression（deferred CHOOSE / 前端 GuardianPresentationPanel） */
export function buildPresentationFromReadinessNegotiationSummary(
  summary: ReadinessGuardianNegotiationSummary,
): GuardianPersonaPresentation {
  const abu = summary.personaEvaluations?.find((e) => e.persona === 'ABU');
  const dre = summary.personaEvaluations?.find((e) => e.persona === 'DRE');
  const neptune = summary.personaEvaluations?.find((e) => e.persona === 'NEPTUNE');

  const presentation = buildPersonaPresentation(
    {
      abu: mapReadinessPersonaToPresentationSlice(abu, 'ABU'),
      drdre: mapReadinessPersonaToPresentationSlice(dre, 'DR_DRE'),
      neptune: mapReadinessPersonaToPresentationSlice(neptune, 'NEPTUNE'),
    },
    { expressionPhase: 'planning' },
  );

  const hardBlocked =
    summary.decision === 'REJECT' &&
    summary.consensusLevel < GUARDIAN_LOW_CONSENSUS_DEFER_THRESHOLD;

  if (hardBlocked) {
    presentation.hardConstraintBlocked = true;
    delete presentation.actions.user;
  } else if (summary.humanDecisionPoints?.length) {
    presentation.actions.user = 'CHOOSE';
  }

  return presentation;
}

/** apply/preview deferred 统一 CHOOSE 读路径 */
export function buildReadinessDeferredChooseFields(
  preRepair: ReadinessGuardianNegotiationSummary,
): {
  humanDecisionPointsFlat: string[];
  presentation: GuardianPersonaPresentation;
} {
  return {
    humanDecisionPointsFlat: preRepair.humanDecisionPoints ?? [],
    presentation: buildPresentationFromReadinessNegotiationSummary(preRepair),
  };
}
