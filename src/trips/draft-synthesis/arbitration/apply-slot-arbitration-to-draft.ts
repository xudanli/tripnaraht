import type { SlotArbitrationResult } from './slot-arbitration.types';

/**
 * 将槽位仲裁结果写回与 LLM / RouteEngine 兼容的 `days[].slots` 结构，供 validateAndRepair 消费。
 * 以 LLM 天块为主模板；缺日则从算法侧拷贝；逐槽用 finalChoice.placeId 覆盖并追加裁决理由。
 */
export function applySlotArbitrationToOrchestrationResult(params: {
  llmDays: { days?: Array<{ day: number; slots?: Record<string, unknown> }> };
  algoDays: { days?: Array<{ day: number; slots?: Record<string, unknown> }> };
  arbitration: SlotArbitrationResult;
}): { days: Array<{ day: number; slots: Record<string, unknown> }> } {
  const llmByDay = new Map<number, { day: number; slots: Record<string, unknown> }>();
  for (const d of params.llmDays.days || []) {
    llmByDay.set(d.day, JSON.parse(JSON.stringify(d)) as { day: number; slots: Record<string, unknown> });
  }
  const algoByDay = new Map<number, { day: number; slots: Record<string, unknown> }>();
  for (const d of params.algoDays.days || []) {
    algoByDay.set(d.day, JSON.parse(JSON.stringify(d)) as { day: number; slots: Record<string, unknown> });
  }

  const dayNums = new Set<number>();
  for (const x of llmByDay.keys()) dayNums.add(x);
  for (const x of algoByDay.keys()) dayNums.add(x);
  for (const dec of params.arbitration.slotDecisions) dayNums.add(dec.day);

  const sorted = [...dayNums].sort((a, b) => a - b);
  const out: Array<{ day: number; slots: Record<string, unknown> }> = [];

  for (const dayNum of sorted) {
    const template =
      llmByDay.get(dayNum) ??
      (algoByDay.get(dayNum)
        ? (JSON.parse(JSON.stringify(algoByDay.get(dayNum))) as {
            day: number;
            slots: Record<string, unknown>;
          })
        : { day: dayNum, slots: {} });
    if (!template.slots) template.slots = {};

    for (const dec of params.arbitration.slotDecisions.filter((s) => s.day === dayNum)) {
      const llmSlot = llmByDay.get(dayNum)?.slots?.[dec.slot] as Record<string, unknown> | undefined;
      const algoSlot = algoByDay.get(dayNum)?.slots?.[dec.slot] as Record<string, unknown> | undefined;
      const pid = dec.finalChoice.placeId;
      let base: Record<string, unknown> = {};
      if (dec.llmChoice?.placeId === pid && llmSlot) base = { ...llmSlot };
      else if (dec.algoChoice?.placeId === pid && algoSlot) base = { ...algoSlot };
      else if (llmSlot) base = { ...llmSlot };
      else if (algoSlot) base = { ...algoSlot };

      const prevReason = typeof base.reason === 'string' ? base.reason : '';
      template.slots[dec.slot] = {
        ...base,
        placeId: pid,
        reason: [prevReason, `[${dec.decisionSource}] ${dec.reason}`].filter(Boolean).join(' ').trim(),
      };
    }
    out.push(template);
  }

  return { days: out };
}
