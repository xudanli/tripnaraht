/** 职场公路片角色协同矩阵 — 队长 MBTI → 推荐补位 MBTI 及加分 */
export interface MbtiSynergyRule {
  captainTypes: string[];
  memberTypes: string[];
  bonusPoints: number;
  narrative: string;
}

export const MBTI_SYNERGY_RULES: MbtiSynergyRule[] = [
  {
    captainTypes: ['INTJ', 'ENTJ'],
    memberTypes: ['ENFP', 'ESFP'],
    bonusPoints: 15,
    narrative: 'INTJ/ENTJ 队长 × ENFP/ESFP 气氛组 — 情绪价值与对外沟通补位',
  },
  {
    captainTypes: ['INTJ', 'ENTJ', 'ISTJ'],
    memberTypes: ['ISTP', 'ESTP'],
    bonusPoints: 12,
    narrative: '战略型队长 × ISTP/ESTP — 硬核执行副手与行中应急',
  },
  {
    captainTypes: ['INFJ', 'ENFJ'],
    memberTypes: ['ESFJ', 'ISFP'],
    bonusPoints: 15,
    narrative: '战略/洞察型 × ESFJ/ISFP 烟火气主理人 — 从宏大叙事回到具体感官地球',
  },
  {
    captainTypes: ['INFJ', 'ENFJ'],
    memberTypes: ['ENTP', 'ESTP'],
    bonusPoints: 12,
    narrative: '洞察型队长 × ENTP/ESTP — 即兴探索与现场推进互补',
  },
  {
    captainTypes: ['INTP', 'ENTP'],
    memberTypes: ['ISFJ', 'ESFJ'],
    bonusPoints: 10,
    narrative: '分析/辩论型 × ISFJ/ESFJ — 后勤秩序与团队氛围稳定',
  },
  {
    captainTypes: ['ISFP', 'INFP'],
    memberTypes: ['ESTJ', 'ENTJ'],
    bonusPoints: 10,
    narrative: '体验型 × ESTJ/ENTJ — 决策推进与路线兜底',
  },
];

export function computeMbtiSynergyBonus(captainMbti: string, memberMbti: string): {
  bonusPoints: number;
  narrative: string | null;
} {
  for (const rule of MBTI_SYNERGY_RULES) {
    if (
      rule.captainTypes.includes(captainMbti) &&
      rule.memberTypes.includes(memberMbti)
    ) {
      return { bonusPoints: rule.bonusPoints, narrative: rule.narrative };
    }
  }
  return { bonusPoints: 0, narrative: null };
}
