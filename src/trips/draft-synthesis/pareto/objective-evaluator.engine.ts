import type { CandidatePlace } from '../../services/candidate-retrieval.engine';
import type { ObjectiveVector } from './objective-vector.types';

const SLOT_ORDER = ['morning', 'lunch', 'afternoon', 'dinner', 'evening'] as const;

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function transportSpeedKmh(transport?: string): number {
  const t = (transport || 'walk').toLowerCase();
  if (t === 'car') return 60;
  if (t === 'transit') return 25;
  return 4;
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/**
 * 从编排层草案（validateAndRepair 前）估计目标向量；用于 Pareto 比较而非精确仿真。
 */
export function evaluateObjectivesFromOrchestration(
  orchestration: { days?: Array<{ day: number; slots?: Record<string, unknown> }> },
  candidatesById: Map<number, CandidatePlace>,
  transport?: string,
): ObjectiveVector {
  const days = orchestration.days ?? [];
  let ratingSum = 0;
  let ratingN = 0;
  const cats = new Set<string>();
  let slotCount = 0;
  let totalKm = 0;
  let legCount = 0;
  let maxLegKm = 0;
  let restaurantSlots = 0;
  let museumSlots = 0;

  const speed = transportSpeedKmh(transport);

  for (const d of days) {
    const slots = d.slots || {};
    let prev: CandidatePlace | undefined;
    for (const slot of SLOT_ORDER) {
      const raw = slots[slot] as { placeId?: number } | undefined;
      if (!raw?.placeId) continue;
      slotCount += 1;
      const p = candidatesById.get(raw.placeId);
      if (!p) continue;
      if (typeof p.rating === 'number') {
        ratingSum += p.rating;
        ratingN += 1;
      }
      cats.add(String(p.category || 'UNKNOWN'));
      const cat = String(p.category || '').toUpperCase();
      if (cat.includes('RESTAURANT')) restaurantSlots += 1;
      if (cat.includes('MUSEUM')) museumSlots += 1;

      if (prev) {
        const km = haversineKm(prev, p);
        totalKm += km;
        legCount += 1;
        maxLegKm = Math.max(maxLegKm, km);
      }
      prev = p;
    }
  }

  const avgRating = ratingN > 0 ? ratingSum / ratingN : 3;
  const satisfaction = clamp01((avgRating / 5) * 0.85 + (slotCount > 0 ? 0.15 : 0));

  const meanLegKm = legCount > 0 ? totalKm / legCount : 0;
  const travelMinEst = legCount > 0 ? (totalKm / speed) * 60 : 0;
  const efficiency = clamp01(1 - Math.min(1, meanLegKm / 25 + travelMinEst / (480 * Math.max(1, days.length))));

  const spendPressure = clamp01(restaurantSlots / Math.max(1, slotCount));
  const cost = clamp01(1 - spendPressure * 0.35);

  const density = slotCount / Math.max(1, days.length * SLOT_ORDER.length);
  const kmPerDay = totalKm / Math.max(1, days.length);
  const fatigueStress = clamp01(0.45 * density + 0.35 * Math.min(1, kmPerDay / 18) + 0.2 * Math.min(1, maxLegKm / 40));
  const fatigue = clamp01(1 - fatigueStress);

  const diversity = cats.size / 12;
  const cultureBoost = museumSlots > 0 ? 0.08 : 0;
  const experience = clamp01(0.55 * diversity + 0.25 * Math.min(1, slotCount / (days.length * 4)) + cultureBoost + 0.12 * satisfaction);

  const jumpRisk = clamp01(maxLegKm / 35);
  const dispersion = clamp01(totalKm / Math.max(1, 80 * days.length));
  const risk = clamp01(1 - 0.65 * jumpRisk - 0.35 * dispersion);

  return {
    satisfaction,
    efficiency,
    cost,
    fatigue,
    experience,
    risk,
  };
}
