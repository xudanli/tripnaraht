import type { OdysseyDimensionPercents, OdysseyRawScores } from '../../odyssey-intake/types/odyssey-intake.types';

export interface InteractionModeDefinition {
  id: string;
  label: string;
}

/** PRD 2.3 / 3.2 — 相处模式标签池 */
export const INTERACTION_MODE_DEFINITIONS: InteractionModeDefinition[] = [
  { id: 'deep_learning', label: '深度共学型' },
  { id: 'easy_companion', label: '轻松陪伴型' },
  { id: 'independent', label: '各自独立型' },
];

const INTERACTION_MODE_BY_ID = new Map(
  INTERACTION_MODE_DEFINITIONS.map((m) => [m.id, m]),
);

export function resolveInteractionModeLabel(modeId: string): string {
  return INTERACTION_MODE_BY_ID.get(modeId)?.label ?? modeId;
}

/** 从 Odyssey 5 题分值推导相处模式（发布时自动带入） */
export function deriveInteractionMode(
  scores: OdysseyRawScores,
  percents: OdysseyDimensionPercents,
): InteractionModeDefinition {
  const social = scores.social_drive;
  const aesthetic = scores.aesthetic_preference;
  const compromise = scores.compromise_index;
  const ambiguity = scores.ambiguity_tolerance;
  const introvert = percents.I > percents.E;

  if (aesthetic >= 1 && compromise >= 0) {
    return INTERACTION_MODE_DEFINITIONS[0];
  }
  if (social >= 1 && !introvert) {
    return INTERACTION_MODE_DEFINITIONS[1];
  }
  if (introvert || ambiguity >= 2) {
    return INTERACTION_MODE_DEFINITIONS[2];
  }
  return INTERACTION_MODE_DEFINITIONS[1];
}
