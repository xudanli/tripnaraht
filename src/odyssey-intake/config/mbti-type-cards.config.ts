import type { MbtiQuadrant } from '../types/odyssey-intake.types';
import { ODYSSEY_CARD_THEMES } from './card-mapping.config';

export interface MbtiTypeCardOption {
  type: string;
  quadrant: MbtiQuadrant;
  label: string;
  tagline: string;
  gradientFrom: string;
  gradientTo: string;
  accentColor?: string;
}

const MBTI_TYPES = [
  'INTJ',
  'INTP',
  'ENTJ',
  'ENTP',
  'INFJ',
  'INFP',
  'ENFJ',
  'ENFP',
  'ISTJ',
  'ISFJ',
  'ESTJ',
  'ESFJ',
  'ISTP',
  'ISFP',
  'ESTP',
  'ESFP',
] as const;

function resolveQuadrant(mbtiType: string): MbtiQuadrant {
  const letters = mbtiType.slice(0, 2);
  if (letters.includes('N') && letters.includes('T')) return 'NT';
  if (letters.includes('N') && letters.includes('F')) return 'NF';
  if (letters.includes('S') && letters.includes('P')) return 'SP';
  return 'SJ';
}

const MBTI_TAGLINES: Record<string, string> = {
  INTJ: '战略型 · 行程表精确到分钟',
  INTP: '分析型 · 对打卡毫无兴趣',
  ENTJ: '指挥型 · 永远在决策',
  ENTP: '辩论型 · Plan B 才是 Plan A',
  INFJ: '洞察型 · 追求意义与深度连接',
  INFP: '理想型 · 随心情与灵感漫游',
  ENFJ: '催化型 · 团队氛围的粘合剂',
  ENFP: '探索型 · 满血复活的社交气氛组',
  ISTJ: '秩序型 · 可靠的后勤执行官',
  ISFJ: '守护型 · 质感与细节控',
  ESTJ: '执行型 · 高效推进的队长基因',
  ESFJ: '协调型 · 照顾全队的体验',
  ISTP: '实操型 · 硬核理性应急担当',
  ISFP: '体验型 · 随性而美的感官旅人',
  ESTP: '行动型 · 即兴脱队的冒险家',
  ESFP: '表演型 · 把旅途变成 live show',
};

export const MBTI_SELF_SELECT_HINT = '已知自己的旅行人格？直接一键点亮。';

export function listMbtiTypeCards(): MbtiTypeCardOption[] {
  return MBTI_TYPES.map((type) => {
    const quadrant = resolveQuadrant(type);
    const theme = ODYSSEY_CARD_THEMES[quadrant];
    return {
      type,
      quadrant,
      label: type,
      tagline: MBTI_TAGLINES[type] ?? '旅行人格',
      gradientFrom: theme.gradientFrom,
      gradientTo: theme.gradientTo,
      accentColor: theme.accentColor,
    };
  });
}

export function isValidMbtiType(value: string): boolean {
  return MBTI_TYPES.includes(value.toUpperCase() as (typeof MBTI_TYPES)[number]);
}
