import { INTERACTION_MODE_LABELS } from '../match-square.constants';

const MBTI_QUADRANT_MAP: Record<string, string> = {
  INTJ: 'NT',
  INTP: 'NT',
  ENTJ: 'NT',
  ENTP: 'NT',
  INFP: 'NF',
  INFJ: 'NF',
  ENFP: 'NF',
  ENFJ: 'NF',
  ISTP: 'SP',
  ISFP: 'SP',
  ESTP: 'SP',
  ESFP: 'SP',
  ISTJ: 'SJ',
  ISFJ: 'SJ',
  ESTJ: 'SJ',
  ESFJ: 'SJ',
};

export type MatchSquarePersonaSnapshot = {
  displayName: string | null;
  cardTitle: string;
  mbtiType: string;
  interactionMode: string;
  interactionModeLabel: string;
  quizComplete: boolean;
};

function readNestedString(
  source: Record<string, unknown> | null | undefined,
  paths: string[][],
  fallback = '',
): string {
  if (!source) return fallback;
  for (const path of paths) {
    let cursor: unknown = source;
    for (const key of path) {
      if (!cursor || typeof cursor !== 'object') {
        cursor = undefined;
        break;
      }
      cursor = (cursor as Record<string, unknown>)[key];
    }
    if (typeof cursor === 'string' && cursor.trim()) {
      return cursor.trim();
    }
  }
  return fallback;
}

export function mbtiQuadrant(mbtiType: string): string {
  return MBTI_QUADRANT_MAP[mbtiType.toUpperCase()] ?? 'NF';
}

export function buildPersonaSnapshot(input: {
  displayName?: string | null;
  preferences?: unknown;
}): MatchSquarePersonaSnapshot {
  const prefs =
    input.preferences && typeof input.preferences === 'object'
      ? (input.preferences as Record<string, unknown>)
      : null;

  const mbtiType = readNestedString(
    prefs,
    [
      ['odyssey', 'mbtiType'],
      ['odysseyIntake', 'mbtiType'],
      ['mbtiType'],
    ],
    'INFJ',
  ).toUpperCase();

  const cardTitle = readNestedString(
    prefs,
    [
      ['odyssey', 'cardTitle'],
      ['odysseyIntake', 'cardTitle'],
      ['cardTitle'],
    ],
    input.displayName?.trim() || '旅行者',
  );

  const interactionMode = readNestedString(
    prefs,
    [
      ['odyssey', 'interactionMode'],
      ['odysseyIntake', 'interactionMode'],
      ['interactionMode'],
    ],
    'easy_companion',
  );

  const quizComplete = Boolean(
    prefs?.odysseyIntakeComplete ??
      prefs?.quizComplete ??
      (readNestedString(prefs, [['odyssey', 'completed']]) === 'true' ||
        readNestedString(prefs, [['odyssey', 'completed']]) === '1') ??
      true,
  );

  return {
    displayName: input.displayName ?? null,
    cardTitle,
    mbtiType,
    interactionMode,
    interactionModeLabel:
      INTERACTION_MODE_LABELS[interactionMode] ?? INTERACTION_MODE_LABELS.easy_companion,
    quizComplete,
  };
}

export function computeCompatibilityPercent(
  captainUserId: string,
  viewerUserId: string | undefined,
): number | null {
  if (!viewerUserId || captainUserId === viewerUserId) return null;
  let hash = 0;
  const seed = `${captainUserId}:${viewerUserId}`;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return 68 + (hash % 24);
}
