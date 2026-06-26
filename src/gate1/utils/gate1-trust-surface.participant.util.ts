import type { Gate1TrustCard, Gate1TrustSurface } from '../types/gate1-trust-surface.types';

const PARTICIPANT_DISCLAIMER =
  '方案说明由团队协助编制，不构成合同、报价或实时预订承诺；出行前请以顾问确认为准。';

const PARTICIPANT_RATIONALE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/脱敏约束满足摘要/g, '团队约束摘要'],
  [/脱敏约束/g, '团队约束'],
  [/约束满足度未结构化标注/g, '约束匹配度待顾问补充说明'],
];

function softenRationale(text: string): string {
  let out = text;
  for (const [pattern, replacement] of PARTICIPANT_RATIONALE_REPLACEMENTS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

function sanitizeCard(card: Gate1TrustCard): Gate1TrustCard {
  return {
    ...card,
    confidence: {
      ...card.confidence,
      rationale: softenRationale(card.confidence.rationale),
    },
    dataSources: card.dataSources
      .filter((s) => s.kind !== 'ADVISOR')
      .map((s) => ({
        ...s,
        label:
          s.kind === 'SANITIZED_CONSTRAINT'
            ? '团队约束摘要'
            : s.kind === 'HUMAN_ASSISTED'
              ? '团队协助编制'
              : s.label,
      })),
    machineAesthetic: {
      humanAssisted: card.machineAesthetic.humanAssisted,
      humanMinutes: null,
      disclaimer: PARTICIPANT_DISCLAIMER,
    },
  };
}

/**
 * 成员 Portal 脱敏信任面：隐藏顾问决策卡与内部运维字段。
 */
export function sanitizeTrustSurfaceForParticipant(surface: Gate1TrustSurface): Gate1TrustSurface {
  const cards = surface.cards
    .filter((c) => c.subjectType === 'CANDIDATE' || c.subjectType === 'PLAN_B')
    .map(sanitizeCard);

  return {
    projectId: surface.projectId,
    schemaVersion: surface.schemaVersion,
    cards,
    summary: {
      totalCards: cards.length,
      highConfidenceCount: cards.filter((c) => c.confidence.level === 'HIGH').length,
      humanAssistedCount: cards.filter((c) => c.machineAesthetic.humanAssisted).length,
    },
  };
}
