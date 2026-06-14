import type { NegotiationResult } from '../../decision/optimization/learning/guardian-persona.interface';
import type { Prisma } from '@prisma/client';
import type {
  ReadinessGuardianNegotiationSnapshot,
  ReadinessGuardianNegotiationSummary,
} from '../types/coverage-map.types';
import { buildGuardianRepairHints } from '../../decision/repair/guardian-repair-hints.util';
import type { GuardianRepairHints } from '../../decision/repair/guardian-repair-hints.types';

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
