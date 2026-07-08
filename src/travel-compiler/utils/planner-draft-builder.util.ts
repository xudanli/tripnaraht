import { randomUUID } from 'crypto';
import type { GuideItineraryDraft } from '../../guide-to-plan/services/guide-plan-builder.service';
import {
  PLANNER_DRAFT_IR_SCHEMA_ID,
  type PlannerDraftIR,
  type PlannerDraftSource,
} from '../contracts/planner-draft-ir.types';

export function buildPlannerDraftFromPoiNames(input: {
  names: string[];
  countryCode: string;
  tripId?: string;
  requestId?: string;
  source?: PlannerDraftSource;
}): PlannerDraftIR {
  return {
    schemaId: PLANNER_DRAFT_IR_SCHEMA_ID,
    compileRequestId: input.requestId ?? randomUUID(),
    tripId: input.tripId,
    requestId: input.requestId,
    source: input.source ?? 'exploration',
    destination: { countryCode: input.countryCode.toUpperCase() },
    days: [
      {
        dayIndex: 0,
        slots: input.names.map((name, i) => ({
          slotId: `mention_${i}`,
          rawText: name,
          hintType: 'poi' as const,
        })),
      },
    ],
    createdAt: new Date().toISOString(),
  };
}

export function buildPlannerDraftFromGuideDraft(input: {
  draft: GuideItineraryDraft;
  countryCode: string;
  tripId?: string;
}): PlannerDraftIR {
  return {
    schemaId: PLANNER_DRAFT_IR_SCHEMA_ID,
    compileRequestId: randomUUID(),
    tripId: input.tripId,
    source: 'guide_import',
    destination: { countryCode: input.countryCode.toUpperCase() },
    days: input.draft.days.map((day) => ({
      dayIndex: day.day - 1,
      date: day.date,
      slots: day.items.map((item, idx) => ({
        slotId: item.candidateId ?? `guide_d${day.day}_i${idx}`,
        rawText: item.name,
        timeHint: item.startTime?.slice(0, 5),
        hintType: item.type === 'hotel' ? 'stay' : 'poi',
        metadata: {
          placeId: item.placeId,
          guideSource: item.source,
        },
      })),
    })),
    createdAt: new Date().toISOString(),
  };
}
