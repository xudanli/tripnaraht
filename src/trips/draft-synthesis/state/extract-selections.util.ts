import type { DraftDay } from '../../dto/trip-draft.dto';
import type { DraftSlot, TripDraftSelection } from './trip-draft-state.types';

const SLOTS: DraftSlot[] = ['morning', 'lunch', 'afternoon', 'dinner', 'evening'];

function isDraftSlot(s: string): s is DraftSlot {
  return (SLOTS as string[]).includes(s);
}

/**
 * 从 LLM 编排 JSON（days[].slots）抽取 selections；跳过 deferred / 无 placeId。
 */
export function extractSelectionsFromLlmOrchestrationResult(llmResult: {
  days?: Array<{
    day: number;
    slots?: Record<string, { placeId?: number | null; deferred?: boolean } | null>;
  }>;
}): TripDraftSelection[] {
  const out: TripDraftSelection[] = [];
  for (const d of llmResult.days || []) {
    const slots = d.slots || {};
    for (const [key, slotVal] of Object.entries(slots)) {
      if (!slotVal || typeof slotVal !== 'object') continue;
      if (slotVal.deferred === true) continue;
      const pid = slotVal.placeId;
      if (pid === undefined || pid === null) continue;
      if (!isDraftSlot(key)) continue;
      const placeId = typeof pid === 'number' ? pid : parseInt(String(pid), 10);
      if (!Number.isFinite(placeId)) continue;
      out.push({
        day: d.day,
        slot: key,
        placeId,
      });
    }
  }
  return out;
}

/**
 * 从已校验的 draftDays（API 出参形态）抽取 selections。
 */
export function extractSelectionsFromValidatedDraftDays(draftDays: DraftDay[]): TripDraftSelection[] {
  const out: TripDraftSelection[] = [];
  for (const d of draftDays || []) {
    const slots = d.slots || {};
    for (const key of SLOTS) {
      const slotVal = slots[key];
      if (!slotVal || typeof slotVal !== 'object') continue;
      if ((slotVal as { deferred?: boolean }).deferred === true) continue;
      const pid = (slotVal as { placeId?: number | null }).placeId;
      if (pid === undefined || pid === null) continue;
      const placeId = typeof pid === 'number' ? pid : parseInt(String(pid), 10);
      if (!Number.isFinite(placeId)) continue;
      out.push({ day: d.day, slot: key, placeId });
    }
  }
  return out;
}
