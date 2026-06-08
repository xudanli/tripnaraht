/**
 * 工作台：Trip 与编排器 itinerary 漂移或 CRUD 改排后，用当前展示行程重算开放时间类 VERIFY 提示。
 */

import type { GateResult, Itinerary } from '../interfaces/trip-plan.interface';
import type { VerificationIssue } from '../../decision/kernel/decision-state.types';
import {
  VERIFY_SYNTHETIC_VIOLATION_PREFIX,
  mergeVerificationIssuesIntoGateResult,
} from './merge-verify-issues-into-gate.util';
import { collectItineraryOpeningHoursVerifyIssues } from './itinerary-opening-hours-verify.util';
import { hydrateOpeningHoursEvidenceForItinerary } from './opening-hours-evidence-hydration.util';

function isOpeningHoursSyntheticViolation(detail: string): boolean {
  const d = detail.toLowerCase();
  return (
    d.includes('poi_closed') ||
    d.includes('opening_hours') ||
    d.includes('开放时间') ||
    d.includes('可能未开放')
  );
}

function openingHoursIssueToVerificationIssue(
  issue: ReturnType<typeof collectItineraryOpeningHoursVerifyIssues>[number],
): VerificationIssue {
  return {
    code: issue.severity === 'ERROR' ? 'POI_CLOSED' : 'POI_CLOSED',
    class: issue.severity === 'ERROR' ? 'CONFLICT' : 'ADVISORY',
    message: issue.message,
    source: 'ITINERARY_VERIFY_SKILL',
    at: new Date().toISOString(),
    entityRef: issue.item_id ? { type: 'POI', id: issue.item_id } : { type: 'OTHER' },
    suggestedActions:
      issue.severity === 'ERROR'
        ? [{ action: 'REPLACE', detail: 'reschedule or replace POI' }]
        : [{ action: 'ASK_USER', detail: 'confirm opening hours' }],
  };
}

export async function resyncWorkbenchOpeningHoursFeasibility(params: {
  gate: GateResult | undefined;
  itinerary: Itinerary | undefined;
  researchData?: Record<string, unknown>;
  shouldResync: boolean;
  openingHoursSkill?: {
    execute: (input: { poi_ids: string[] }) => Promise<{ opening_hours?: unknown[] }>;
  };
}): Promise<GateResult | undefined> {
  if (!params.shouldResync || !params.gate || !params.itinerary?.days?.length) {
    return params.gate;
  }

  const researchData =
    params.researchData && typeof params.researchData === 'object'
      ? ({ ...params.researchData } as Record<string, unknown>)
      : ({} as Record<string, unknown>);

  if (params.openingHoursSkill) {
    try {
      await hydrateOpeningHoursEvidenceForItinerary({
        itinerary: params.itinerary,
        researchData,
        openingHoursSkill: params.openingHoursSkill,
      });
    } catch {
      // best-effort hydrate before local re-verify
    }
  }

  const freshIssues = collectItineraryOpeningHoursVerifyIssues(params.itinerary, researchData);
  const baseViolations = (params.gate.violations ?? []).filter((v) => {
    const detail = String(v.detail ?? '');
    if (!detail.trimStart().startsWith(VERIFY_SYNTHETIC_VIOLATION_PREFIX)) return true;
    return !isOpeningHoursSyntheticViolation(detail);
  });

  const gateWithoutOhSynthetic: GateResult = { ...params.gate, violations: baseViolations };
  const verificationIssues = freshIssues.map(openingHoursIssueToVerificationIssue);
  return mergeVerificationIssuesIntoGateResult(gateWithoutOhSynthetic, verificationIssues);
}
