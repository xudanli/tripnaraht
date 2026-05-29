/**
 * PA ContextAnalyzer 槽位分析 → route_and_run 澄清卡候选。
 */

import type { TripContext } from '../assistants/trip-planner/interfaces/trip-planner.interface';
import type { ItinerarySlotPlacementGapResult } from '../assistants/trip-planner/interfaces/itinerary-slot-placement.interface';
import type { ItinerarySlotPolisherService } from '../services/itinerary-slot-polisher.service';
import type { ItinerarySlotCandidate } from './itinerary-slot-placement.util';

export type SlotPlacementPolishAuditTag = 'polish_applied' | 'polish_skipped' | 'polish_disabled';

function formatRecommendNote(coreNote: string): string {
  const note = coreNote.trim();
  return note ? `【系统推荐：${note}】` : '';
}

function dayActivitiesFromTrip(tripContext: TripContext | undefined, dayNumber: number): string[] {
  const day = tripContext?.days.find((d) => d.dayNumber === dayNumber);
  if (!day) return [];
  return day.items.map((i) => i.name).filter(Boolean).slice(0, 6);
}

function mapSuggestedDayToCandidate(
  d: ItinerarySlotPlacementGapResult['suggestedDays'][number],
  coreNote: string,
): ItinerarySlotCandidate {
  const routePart = d.labelHint ? ` ${d.labelHint}` : '';
  return {
    dayNumber: d.dayNumber,
    dateYmd: d.dateYmd,
    label: `D${d.dayNumber}（${d.dateYmd}）${routePart}`.trim(),
    reason_zh: formatRecommendNote(coreNote) || '根据行程上下文推荐',
    score: d.confidence,
    schedule_tight: d.scheduleTight === true,
  };
}

export function paSuggestedDaysToSlotCandidates(
  pa: ItinerarySlotPlacementGapResult | undefined | null,
): ItinerarySlotCandidate[] {
  if (!pa?.suggestedDays?.length) return [];

  return pa.suggestedDays.map((d) => {
    const coreNote =
      d.scheduleTight && d.tightScheduleNoteZh
        ? d.tightScheduleNoteZh
        : d.reasonZh && d.sources.length > 0
          ? d.reasonZh
          : d.reasonZh || '';
    return mapSuggestedDayToCandidate(d, coreNote);
  });
}

/**
 * 同步构建候选后，对 scheduleTight 日行可选 LLM 润色（非阻塞主链）。
 */
export async function paSuggestedDaysToSlotCandidatesWithPolish(
  pa: ItinerarySlotPlacementGapResult,
  opts?: {
    polisher?: ItinerarySlotPolisherService;
    tripId?: string;
    tripContext?: TripContext;
    onPolishAudit?: (tag: SlotPlacementPolishAuditTag) => void;
  },
): Promise<ItinerarySlotCandidate[]> {
  if (!pa.suggestedDays?.length) return [];

  const polisher = opts?.polisher;
  const tripId = opts?.tripId?.trim() ?? '';
  const enabled = Boolean(polisher?.isEnabled());

  if (!enabled) {
    opts?.onPolishAudit?.('polish_disabled');
    return paSuggestedDaysToSlotCandidates(pa);
  }

  const candidates: ItinerarySlotCandidate[] = [];
  let anyApplied = false;
  let anySkipped = true;

  for (const d of pa.suggestedDays) {
    let coreNote =
      d.scheduleTight && d.tightScheduleNoteZh
        ? d.tightScheduleNoteZh
        : d.reasonZh && d.sources.length > 0
          ? d.reasonZh
          : d.reasonZh || '';

    if (d.scheduleTight && d.tightScheduleNoteZh && tripId && polisher) {
      const base = d.tightScheduleNoteZh;
      const polished = await polisher.polishTightScheduleReason({
        tripId,
        dayNumber: d.dayNumber,
        currentActivities: dayActivitiesFromTrip(opts?.tripContext, d.dayNumber),
        baseReasonZh: base,
      });
      if (polished.trim() && polished.trim() !== base.trim()) {
        coreNote = polished.trim();
        anyApplied = true;
        anySkipped = false;
      }
    }

    candidates.push(mapSuggestedDayToCandidate(d, coreNote));
  }

  if (anyApplied) {
    opts?.onPolishAudit?.('polish_applied');
  } else if (enabled) {
    opts?.onPolishAudit?.('polish_skipped');
  }

  return candidates;
}

export function shouldPreferPaSlotCandidates(
  pa: ItinerarySlotPlacementGapResult | undefined | null,
): boolean {
  return Boolean(pa?.suggestedDays?.length && (pa.confidence ?? 0) >= 0.5);
}

export function appendPolishAuditToAnalysisPath(
  pa: ItinerarySlotPlacementGapResult,
  tag: SlotPlacementPolishAuditTag,
): void {
  pa.analysisPath = [...(pa.analysisPath ?? []), tag];
}
