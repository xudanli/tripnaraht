/**
 * At most one repair pass. terminal:false — must re-enter Independent VERIFY.
 * Never writes PlanVersion. Never self-declares VERIFIED.
 */

import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { InitialPlanProposal } from '../types/iceland-initial-plan-proposal.types';
import type {
  InitialPlanAuthoritativeVerification,
  InitialPlanRepairResult,
  RepairOperation,
} from '../types/iceland-initial-plan-verification.types';

function parseEvidenceInt(refs: string[], prefix: string): number | undefined {
  const raw = refs.find((r) => r.startsWith(prefix))?.slice(prefix.length);
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function parseEvidenceStr(refs: string[], prefix: string): string | undefined {
  return refs.find((r) => r.startsWith(prefix))?.slice(prefix.length);
}

@Injectable()
export class IcelandInitialPlanRepairOnceService {
  repair(input: {
    proposal: InitialPlanProposal;
    authoritative: InitialPlanAuthoritativeVerification;
  }): { proposal: InitialPlanProposal; repair: InitialPlanRepairResult } {
    const ops: RepairOperation[] = [];
    const repairedCids: string[] = [];
    const removeItemIds = new Set<string>();
    const lodgingFixes = new Map<
      number,
      { placeId: number; nightDate?: string; label?: string }
    >();

    for (const a of input.authoritative.assessments) {
      if (a.status !== 'BLOCK' && a.status !== 'REPAIR' && a.status !== 'EXECUTION_BLOCK') {
        continue;
      }
      if (
        a.cid.startsWith('ICELAND_VEHICLE_') ||
        a.cid === 'ICELAND_HIGHLANDS_MIX_001'
      ) {
        for (const id of a.affectedItemIds ?? []) {
          removeItemIds.add(id);
          ops.push({
            kind: 'DROP_VEHICLE_INCOMPATIBLE',
            itemId: id,
            dayIndex: a.affectedDayIndex,
            cid: a.cid,
          });
        }
        repairedCids.push(a.cid);
      }
      if (a.cid.startsWith('ICELAND_DAY_SCOPE_')) {
        // Drop items beyond first subregion — keep first item's subregion cluster
        const day = input.proposal.days.find((d) => d.dayIndex === a.affectedDayIndex);
        if (day && day.items.length > 1) {
          const keepSub = day.items[0]?.evidence.subregionId;
          for (const it of day.items.slice(1)) {
            if (it.evidence.subregionId && it.evidence.subregionId !== keepSub) {
              removeItemIds.add(it.itemId);
              ops.push({
                kind: 'SPLIT_DAY_SCOPE',
                itemId: it.itemId,
                dayIndex: day.dayIndex,
                cid: a.cid,
              });
            }
          }
          repairedCids.push(a.cid);
        }
      }
      if (a.cid === 'ICELAND_EXPERIENCE_BOOKING_001') {
        for (const id of a.affectedItemIds ?? []) {
          ops.push({
            kind: 'DOWNGRADE_BOOKING_STATE',
            itemId: id,
            dayIndex: a.affectedDayIndex,
            cid: a.cid,
            detail: 'CONFIRMED→NEEDS_BOOKING_VERIFICATION',
          });
        }
        repairedCids.push(a.cid);
      }
      if (a.cid === 'ICELAND_LODGING_ANCHOR_001' && a.status === 'REPAIR') {
        const expectedPlaceId = parseEvidenceInt(a.evidenceRefs, 'expected:');
        const nightDate = parseEvidenceStr(a.evidenceRefs, 'night:');
        if (expectedPlaceId != null && a.affectedDayIndex != null) {
          lodgingFixes.set(a.affectedDayIndex, {
            placeId: expectedPlaceId,
            nightDate,
          });
          ops.push({
            kind: 'SET_LODGING_ANCHOR',
            dayIndex: a.affectedDayIndex,
            cid: a.cid,
            detail: `endAnchor→${expectedPlaceId}`,
          });
          repairedCids.push(a.cid);
        }
      }
    }

    const newDays = input.proposal.days.map((d) => {
      const day = {
        ...d,
        items: d.items.filter((it) => !removeItemIds.has(it.itemId)),
      };
      const fix = lodgingFixes.get(d.dayIndex);
      if (fix) {
        day.endAnchor = {
          placeId: fix.placeId,
          label: fix.label ?? d.endAnchor?.label,
          nightDate: fix.nightDate ?? d.date,
          source: 'CONFIRMED_BOOKING',
        };
      }
      return day;
    });

    // Re-sync next-day startAnchor after lodging fixes
    for (let i = 0; i < newDays.length - 1; i++) {
      const end = newDays[i]!.endAnchor;
      if (end?.placeId != null && lodgingFixes.has(newDays[i]!.dayIndex)) {
        newDays[i + 1]!.startAnchor = { ...end };
      }
    }

    const repairedProposalId = randomUUID();
    const proposal: InitialPlanProposal = {
      ...input.proposal,
      proposalId: repairedProposalId,
      version: input.proposal.version + 1,
      days: newDays,
      writesPlanVersion: false,
    };

    const remainingCids = input.authoritative.assessments
      .filter(
        (a) =>
          (a.status === 'BLOCK' ||
            a.status === 'EXECUTION_BLOCK' ||
            a.status === 'REPAIR') &&
          !repairedCids.includes(a.cid),
      )
      .map((a) => a.cid);

    const repair: InitialPlanRepairResult = {
      repairedProposalId,
      parentProposalId: input.proposal.proposalId,
      appliedOperations: ops,
      repairedCids: [...new Set(repairedCids)],
      remainingCids,
      terminal: false,
      writesPlanVersion: false,
    };

    return { proposal, repair };
  }
}
