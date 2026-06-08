import type { MbtiQuadrant } from '../../odyssey-intake/types/odyssey-intake.types';

const QUADRANT_BY_MBTI: Record<string, MbtiQuadrant> = {
  INTJ: 'NT',
  INTP: 'NT',
  ENTJ: 'NT',
  ENTP: 'NT',
  INFJ: 'NF',
  INFP: 'NF',
  ENFJ: 'NF',
  ENFP: 'NF',
  ISTP: 'SP',
  ISFP: 'SP',
  ESTP: 'SP',
  ESFP: 'SP',
  ISTJ: 'SJ',
  ISFJ: 'SJ',
  ESTJ: 'SJ',
  ESFJ: 'SJ',
};

export function resolveMbtiQuadrant(mbtiType: string): MbtiQuadrant {
  return QUADRANT_BY_MBTI[mbtiType.toUpperCase()] ?? 'NF';
}

export const PERSONA_QUADRANT_OPTIONS: Array<{ id: MbtiQuadrant; label: string }> = [
  { id: 'NT', label: 'NT 分析型' },
  { id: 'NF', label: 'NF 理想型' },
  { id: 'SP', label: 'SP 体验型' },
  { id: 'SJ', label: 'SJ 秩序型' },
];

export const PERSONA_TYPE_OPTIONS = Object.entries(QUADRANT_BY_MBTI).map(([id, quadrant]) => ({
  id,
  label: `${id} (${quadrant})`,
}));

export function mbtiMatchesQuadrantFilter(mbtiType: string, quadrants: MbtiQuadrant[]): boolean {
  if (quadrants.length === 0) return true;
  return quadrants.includes(resolveMbtiQuadrant(mbtiType));
}
