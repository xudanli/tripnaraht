/**
 * TripNara 节奏控制引擎
 *
 * 规则：连续 museum ≤ 1，连续 attraction ≤ 2，restaurant 必须穿插
 *
 * @see docs/Decision_OS_实施例_旅行规划.md
 */

import { Injectable, Logger } from '@nestjs/common';
import type { CandidatePlace } from './candidate-retrieval.engine';
import { TimeSlot } from '../dto/trip-draft.dto';

const ACTIVITY_SLOTS: TimeSlot[] = [
  TimeSlot.MORNING,
  TimeSlot.AFTERNOON,
  TimeSlot.EVENING,
];

@Injectable()
export class PacingEngine {
  private readonly logger = new Logger(PacingEngine.name);

  isMuseum(c: CandidatePlace): boolean {
    const ct = (c.canonicalType ?? '').toUpperCase();
    const tags = (c.tags ?? []).join(' ').toLowerCase();
    return (
      ct.includes('MUSEUM') ||
      tags.includes('museum') ||
      tags.includes('博物馆')
    );
  }

  isAttraction(c: CandidatePlace): boolean {
    return (
      c.category === 'ATTRACTION' ||
      c.category === 'SHOPPING' ||
      c.category === 'TRANSIT_HUB'
    );
  }

  /**
   * 检查节奏约束
   * @returns 违规列表
   */
  check(
    daySlots: Record<string, { placeId: number }>,
    candidates: CandidatePlace[],
  ): Array<{ slot: string; rule: string; message: string }> {
    const violations: Array<{ slot: string; rule: string; message: string }> =
      [];
    const map = new Map(candidates.map((c) => [c.id, c]));

    const types: Array<{ slot: string; isMuseum: boolean; isAttraction: boolean }> =
      [];
    for (const slot of ACTIVITY_SLOTS) {
      const pid = daySlots[slot]?.placeId;
      if (!pid) continue;
      const c = map.get(pid);
      if (!c) continue;
      types.push({
        slot,
        isMuseum: this.isMuseum(c),
        isAttraction: this.isAttraction(c),
      });
    }

    let consecutiveMuseum = 0;
    let consecutiveAttraction = 0;

    for (const t of types) {
      if (t.isMuseum) {
        consecutiveMuseum++;
        consecutiveAttraction = 0;
        if (consecutiveMuseum > 1) {
          violations.push({
            slot: t.slot,
            rule: 'consecutive_museum',
            message: `连续博物馆超过 1 个`,
          });
        }
      } else if (t.isAttraction) {
        consecutiveAttraction++;
        consecutiveMuseum = 0;
        if (consecutiveAttraction > 2) {
          violations.push({
            slot: t.slot,
            rule: 'consecutive_attraction',
            message: `连续景点超过 2 个`,
          });
        }
      } else {
        consecutiveMuseum = 0;
        consecutiveAttraction = 0;
      }
    }

    return violations;
  }

  /**
   * 在 pick 时是否应避免某类（用于 RouteOptimization 选点时的约束）
   */
  shouldAvoidForPacing(
    slot: TimeSlot,
    candidate: CandidatePlace,
    previousTypes: Array<{ isMuseum: boolean; isAttraction: boolean }>,
  ): boolean {
    const isMuseum = this.isMuseum(candidate);
    const isAttraction = this.isAttraction(candidate);

    if (isMuseum && previousTypes.some((p) => p.isMuseum)) return true;
    if (
      isAttraction &&
      previousTypes.filter((p) => p.isAttraction).length >= 2
    )
      return true;
    return false;
  }
}
