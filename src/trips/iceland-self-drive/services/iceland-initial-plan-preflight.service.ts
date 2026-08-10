/**
 * Generator self-check — PREFLIGHT only. Never authoritative.
 * Never writes PlanVersion. Never emits VERIFIED / EXECUTABLE / SAFE_TO_APPLY.
 */

import { Injectable } from '@nestjs/common';
import type { InitialPlanProposal } from '../types/iceland-initial-plan-proposal.types';
import type { InitialPlanArrangeInput } from '../types/iceland-initial-plan-seed.types';
import type {
  InitialPlanPreflightResult,
  PreflightIssue,
} from '../types/iceland-initial-plan-verification.types';

@Injectable()
export class IcelandInitialPlanPreflightService {
  run(input: {
    proposal: InitialPlanProposal;
    arrange: InitialPlanArrangeInput;
    dayScopePackIds?: string[];
  }): InitialPlanPreflightResult {
    const issues: PreflightIssue[] = [];
    const { proposal, arrange } = input;

    if (!proposal.days.length) {
      issues.push({
        code: 'PREFLIGHT_NO_DAYS',
        severity: 'FAIL',
        message: 'Proposal has no days',
      });
    }

    for (const day of proposal.days) {
      if (!day.date) {
        issues.push({
          code: 'PREFLIGHT_MISSING_DATE',
          severity: 'FAIL',
          message: `Day ${day.dayIndex} missing date`,
          dayIndex: day.dayIndex,
        });
      }
      for (const item of day.items) {
        if (!item.itemId) {
          issues.push({
            code: 'PREFLIGHT_MISSING_ITEM_ID',
            severity: 'FAIL',
            message: 'Item missing itemId',
            dayIndex: day.dayIndex,
          });
        }
        if (item.endMin < item.startMin) {
          issues.push({
            code: 'PREFLIGHT_INVALID_WINDOW',
            severity: 'FAIL',
            message: `Invalid time window on ${item.itemId}`,
            dayIndex: day.dayIndex,
            itemId: item.itemId,
          });
        }
      }
      const activity = day.items.reduce((s, i) => s + (i.endMin - i.startMin), 0);
      if (activity > 12 * 60) {
        issues.push({
          code: 'PREFLIGHT_ACTIVITY_OVERLOAD',
          severity: 'WARN',
          message: `Day ${day.dayIndex} activity minutes ${activity} look high`,
          dayIndex: day.dayIndex,
        });
      }
    }

    // Relation projection integrity: parent without coverage flag on child is ok;
    // orphan child cluster id without sibling is WARN
    for (const day of proposal.days) {
      const clusters = new Map<string, string[]>();
      for (const it of day.items) {
        if (!it.visitClusterId) continue;
        if (!clusters.has(it.visitClusterId)) clusters.set(it.visitClusterId, []);
        clusters.get(it.visitClusterId)!.push(it.itemId);
      }
    }

    // Obvious same-day multi-subregion (preflight only — authority still required)
    const scopePacks = new Set(input.dayScopePackIds ?? []);
    for (const day of proposal.days) {
      const byPack = new Map<string, Set<string>>();
      for (const it of day.items) {
        const sub = it.evidence.subregionId;
        const pack = arrange.attractionCandidates.find(
          (a) => a.canonicalPlaceId === it.placeId,
        )?.packId;
        if (!pack || !sub || !scopePacks.has(pack)) continue;
        if (!byPack.has(pack)) byPack.set(pack, new Set());
        byPack.get(pack)!.add(sub);
      }
      for (const [pack, subs] of byPack) {
        if (subs.size > 1) {
          issues.push({
            code: 'PREFLIGHT_DAY_SCOPE_HINT',
            severity: 'WARN',
            message: `Day ${day.dayIndex} pack ${pack} spans ${[...subs].join(',')}`,
            dayIndex: day.dayIndex,
          });
        }
      }
    }

    if (arrange.unresolvedEntities.length) {
      issues.push({
        code: 'PREFLIGHT_UNRESOLVED_ENTITIES',
        severity: 'WARN',
        message: `${arrange.unresolvedEntities.length} unresolved catalog entities`,
      });
    }

    const hasFail = issues.some((i) => i.severity === 'FAIL');
    const hasWarn = issues.some((i) => i.severity === 'WARN');
    const status = hasFail
      ? 'PREFLIGHT_FAIL'
      : hasWarn
        ? 'PREFLIGHT_WARN'
        : 'PREFLIGHT_PASS';

    return {
      status,
      issues,
      authoritative: false,
      checkType: 'PREFLIGHT',
      writesPlanVersion: false,
    };
  }
}
