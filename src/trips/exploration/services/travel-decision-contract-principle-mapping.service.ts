import { Injectable } from '@nestjs/common';
import type { TravelPrincipleKey } from '../../trip-constraint-solver/types/travel-decision-contract.types';
import type { ConsumerPrincipleId } from '../constants/exploration-status.constants';
import type { ExplorationInput } from '../types/exploration.types';

export interface PrincipleMappingConstraintHint {
  templateId?: string;
  paramPatch?: Record<string, unknown>;
}

export interface ConsumerPrincipleMappingResult {
  rankedPrinciples: TravelPrincipleKey[];
  constraintHints: PrincipleMappingConstraintHint[];
}

export const CONSUMER_PRINCIPLE_LABELS: Record<ConsumerPrincipleId, { label: string; description: string }> = {
  LOW_DRIVING: {
    label: '少赶路',
    description: '降低每日驾驶强度，把更多时间留给停留和体验。',
  },
  NO_NIGHT_DRIVING: {
    label: '不夜驾',
    description: '避免夜间驾驶，优先白天完成路段移动。',
  },
  CORE_EXPERIENCE_FIRST: {
    label: '核心体验优先',
    description: '优先保证必去体验和关键景点，其他安排可灵活调整。',
  },
  REMOTE_EXPLORATION: {
    label: '更想探索小众区域',
    description: '愿意接受更高不确定性，换取更深入的偏远区域探索。',
  },
  BUDGET_FLEXIBLE: {
    label: '预算可以适度增加',
    description: '在关键体验或必要升级上，可以接受适度超预算。',
  },
  STAY_STABILITY: {
    label: '住宿稳定优先',
    description: '减少换宿频率，优先连续多晚住在同一区域。',
  },
};

/** Consumer Principle → Contract 映射 SSOT（V1.1） */
const CONSUMER_TO_CONTRACT: Record<ConsumerPrincipleId, TravelPrincipleKey> = {
  LOW_DRIVING: 'PACE',
  NO_NIGHT_DRIVING: 'SAFETY',
  CORE_EXPERIENCE_FIRST: 'CORE_EXPERIENCE',
  REMOTE_EXPLORATION: 'COVERAGE',
  BUDGET_FLEXIBLE: 'BUDGET',
  STAY_STABILITY: 'FEWER_HOTEL_CHANGES',
};

const CONSTRAINT_HINTS: Partial<
  Record<ConsumerPrincipleId, PrincipleMappingConstraintHint[]>
> = {
  LOW_DRIVING: [{ templateId: 'max_daily_drive', paramPatch: { strict: true } }],
  NO_NIGHT_DRIVING: [{ templateId: 'no_night_drive', paramPatch: { enabled: true } }],
  STAY_STABILITY: [{ templateId: 'minimize_hotel_changes', paramPatch: { weight: 'high' } }],
};

@Injectable()
export class TravelDecisionContractPrincipleMappingService {
  mapConsumerPrinciples(
    selections: Array<{ principleId: ConsumerPrincipleId; rank: number }>,
    _context?: {
      input?: ExplorationInput;
      destinationCode?: string;
    },
  ): ConsumerPrincipleMappingResult {
    const sorted = [...selections].sort((a, b) => a.rank - b.rank);
    const seen = new Set<TravelPrincipleKey>();
    const rankedPrinciples: TravelPrincipleKey[] = [];

    for (const sel of sorted) {
      const contractKey = CONSUMER_TO_CONTRACT[sel.principleId];
      if (!seen.has(contractKey)) {
        seen.add(contractKey);
        rankedPrinciples.push(contractKey);
      }
    }

    const constraintHints: PrincipleMappingConstraintHint[] = [];
    for (const sel of sorted) {
      const hints = CONSTRAINT_HINTS[sel.principleId];
      if (hints) constraintHints.push(...hints);
    }

    return { rankedPrinciples, constraintHints };
  }

  listConsumerPrincipleCards(): Array<{
    principleId: ConsumerPrincipleId;
    label: string;
    description: string;
  }> {
    return (Object.keys(CONSUMER_PRINCIPLE_LABELS) as ConsumerPrincipleId[]).map((id) => ({
      principleId: id,
      ...CONSUMER_PRINCIPLE_LABELS[id],
    }));
  }
}
