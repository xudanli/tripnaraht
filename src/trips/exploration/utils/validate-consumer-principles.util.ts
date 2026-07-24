import { BadRequestException } from '@nestjs/common';
import {
  CONSUMER_PRINCIPLE_IDS,
  type ConsumerPrincipleId,
} from '../constants/exploration-status.constants';

export interface ConsumerPrincipleSelection {
  principleId: ConsumerPrincipleId;
  rank: number;
}

export function validateConsumerPrincipleSelections(
  principles: ConsumerPrincipleSelection[],
  options?: { allowEmpty?: boolean },
): void {
  if (principles.length === 0) {
    if (options?.allowEmpty) return;
    throw new BadRequestException({
      code: 'INVALID_PRINCIPLES',
      message: 'Select 1 to 3 travel principles',
    });
  }

  if (principles.length > 3) {
    throw new BadRequestException({
      code: 'INVALID_PRINCIPLES',
      message: 'At most 3 principles allowed',
    });
  }

  const ids = new Set<string>();
  const ranks = new Set<number>();
  for (const sel of principles) {
    if (!CONSUMER_PRINCIPLE_IDS.includes(sel.principleId)) {
      throw new BadRequestException({
        code: 'INVALID_PRINCIPLES',
        message: `Unknown principleId: ${sel.principleId}`,
      });
    }
    if (ids.has(sel.principleId)) {
      throw new BadRequestException({
        code: 'INVALID_PRINCIPLES',
        message: `Duplicate principleId: ${sel.principleId}`,
      });
    }
    ids.add(sel.principleId);

    if (!Number.isInteger(sel.rank) || sel.rank < 1 || sel.rank > 3) {
      throw new BadRequestException({
        code: 'INVALID_PRINCIPLES',
        message: `Invalid rank for ${sel.principleId}: must be 1–3`,
      });
    }
    if (ranks.has(sel.rank)) {
      throw new BadRequestException({
        code: 'INVALID_PRINCIPLES',
        message: `Duplicate rank: ${sel.rank}`,
      });
    }
    ranks.add(sel.rank);
  }

  const expectedRanks = new Set(Array.from({ length: principles.length }, (_, i) => i + 1));
  for (const rank of ranks) {
    if (!expectedRanks.has(rank)) {
      throw new BadRequestException({
        code: 'INVALID_PRINCIPLES',
        message: 'rank must be consecutive starting from 1',
      });
    }
  }
}
