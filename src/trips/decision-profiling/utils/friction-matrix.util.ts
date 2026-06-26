import type { DecisionStyleType } from '../types/decision-profiling.types';
import {
  FRICTION_DOMAINS,
  type FrictionAlert,
  type FrictionDomain,
  type FrictionLevel,
  type FrictionMatrixEntry,
  type FrictionPairCell,
  type MoneyDnaCard,
  type TravelStyleCard,
} from '../types/decision-profiling.types';

const DOMAIN_LABELS: Record<FrictionDomain, string> = {
  accommodation: '住宿',
  dining: '餐饮',
  activities: '活动体验',
  transportation: '交通',
  pace: '行程节奏',
  budget: '预算心理',
  planning_style: '规划方式',
  group_decision: '集体决策',
};

interface MemberProfile {
  userId: string;
  displayName: string;
  style: TravelStyleCard;
  money: MoneyDnaCard;
}

function levelFromScore(score: number): FrictionLevel {
  if (score >= 0.55) return 'red';
  if (score >= 0.3) return 'yellow';
  return 'green';
}

function styleFriction(a: DecisionStyleType, b: DecisionStyleType, domain: FrictionDomain): number {
  if (a === b) return 0;

  const pairs: Record<string, number> = {
    'PRAGMATIC_PLANNER|SPONTANEOUS_ADVENTURER': 0.7,
    'PRAGMATIC_PLANNER|EXPERIENCE_SEEKER': 0.45,
    'RATIONAL_EXPLORER|SPONTANEOUS_ADVENTURER': 0.5,
    'EXPERIENCE_SEEKER|PRAGMATIC_PLANNER': 0.45,
  };
  const key = [a, b].sort().join('|');
  let base = pairs[key] ?? 0.2;

  const domainBoost: Partial<Record<FrictionDomain, Partial<Record<string, number>>>> = {
    accommodation: {
      'EXPERIENCE_SEEKER|PRAGMATIC_PLANNER': 0.15,
    },
    pace: {
      'PRAGMATIC_PLANNER|SPONTANEOUS_ADVENTURER': 0.2,
    },
    group_decision: {
      'HARMONY_COORDINATOR|PRAGMATIC_PLANNER': -0.15,
    },
  };
  base += domainBoost[domain]?.[key] ?? 0;
  return Math.min(1, Math.max(0, base));
}

function moneyFriction(
  a: MoneyDnaCard,
  b: MoneyDnaCard,
  styleA: DecisionStyleType,
  styleB: DecisionStyleType,
  domain: FrictionDomain,
): { score: number; reason?: string } {
  const va = a.vector;
  const vb = b.vector;
  let score = 0;
  let reason: string | undefined;

  switch (domain) {
    case 'accommodation':
      score = Math.abs(va.qualityTendency - vb.qualityTendency) * 0.6
        + Math.abs(va.experienceTendency - vb.experienceTendency) * 0.4;
      if (score >= 0.45) {
        reason = `${va.qualityTendency > vb.qualityTendency ? '一方' : '另一方'}更在意酒店品质，另一方更在意独特体验`;
      }
      break;
    case 'dining':
      score = Math.abs(va.experienceTendency - vb.experienceTendency) * 0.5
        + Math.abs(va.qualityTendency - vb.qualityTendency) * 0.5;
      break;
    case 'activities':
      score = Math.abs(va.experienceTendency - vb.experienceTendency) * 0.7
        + Math.abs(va.socialScarcityTendency - vb.socialScarcityTendency) * 0.3;
      break;
    case 'transportation':
      score = Math.abs(va.timeValueTendency - vb.timeValueTendency);
      break;
    case 'budget': {
      const aMax = a.budgetRangeMax ?? 3000;
      const bMax = b.budgetRangeMax ?? 3000;
      const aMin = a.budgetRangeMin ?? aMax * 0.5;
      const bMin = b.budgetRangeMin ?? bMax * 0.5;
      const overlap = Math.max(0, Math.min(aMax, bMax) - Math.max(aMin, bMin));
      const union = Math.max(aMax, bMax) - Math.min(aMin, bMin) || 1;
      score = 1 - overlap / union;
      break;
    }
    case 'planning_style':
      score = a.consumptionPace !== b.consumptionPace
        ? a.consumptionPace === 'balanced' || b.consumptionPace === 'balanced' ? 0.25 : 0.55
        : 0;
      break;
    case 'pace':
      score = styleFriction(styleA, styleB, domain);
      break;
    case 'group_decision':
      score = styleFriction(styleA, styleB, domain);
      break;
    default:
      score = 0;
  }

  return { score: Math.min(1, score), reason };
}

export function computeFrictionMatrix(members: MemberProfile[]): FrictionMatrixEntry[] {
  const entries: FrictionMatrixEntry[] = [];

  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const a = members[i];
      const b = members[j];
      const cells: FrictionPairCell[] = FRICTION_DOMAINS.map((domain) => {
        const stylePart = styleFriction(a.style.styleType, b.style.styleType, domain) * 0.4;
        const moneyPart = moneyFriction(
          a.money,
          b.money,
          a.style.styleType,
          b.style.styleType,
          domain,
        );
        const score = Math.min(1, stylePart + moneyPart.score * 0.6);
        return {
          domain,
          level: levelFromScore(score),
          score: Math.round(score * 100) / 100,
          reason: moneyPart.reason,
        };
      });

      const maxScore = Math.max(...cells.map((c) => c.score));
      entries.push({
        memberAId: a.userId,
        memberBId: b.userId,
        memberAName: a.displayName,
        memberBName: b.displayName,
        cells,
        overallLevel: levelFromScore(maxScore),
      });
    }
  }

  return entries;
}

export function buildHighRiskAlerts(matrix: FrictionMatrixEntry[]): FrictionAlert[] {
  const alerts: FrictionAlert[] = [];

  for (const entry of matrix) {
    for (const cell of entry.cells) {
      if (cell.level !== 'red') continue;
      alerts.push({
        id: `${entry.memberAId}:${entry.memberBId}:${cell.domain}`,
        domain: cell.domain,
        domainLabel: DOMAIN_LABELS[cell.domain],
        level: 'red',
        memberAId: entry.memberAId,
        memberBId: entry.memberBId,
        memberAName: entry.memberAName,
        memberBName: entry.memberBName,
        summary: `在${DOMAIN_LABELS[cell.domain]}方面，${entry.memberAName}与${entry.memberBName}存在显著差异。${cell.reason ?? '决策风格与消费倾向不一致。'}`,
        recommendedStrategy: strategyForDomain(cell.domain),
      });
    }
  }

  return alerts;
}

function strategyForDomain(domain: FrictionDomain): string {
  const strategies: Record<FrictionDomain, string> = {
    accommodation:
      '建议采用混搭方案——城市段满足品质需求，自然景区段满足体验需求；或按路段分工主导住宿选择。',
    dining: '可约定「一顿精品、一顿本地」交替，或分头用餐后汇合。',
    activities: '提前列出必做/可选清单，用投票或轮流主导方式收敛。',
    transportation: '明确时间敏感者与体验优先者的分工，大交通提前锁定。',
    pace: '设定每日「固定锚点 + 弹性时段」，减少临时变更冲突。',
    budget: '公开心理预算区间，大额支出事前共识，小额各自灵活。',
    planning_style: '约定「大额提前订、小额行中灵活」的混合消费节奏。',
    group_decision: '关键节点用结构化协商（如 Round Robin），日常小事授权个人决定。',
  };
  return strategies[domain];
}

export { DOMAIN_LABELS };
