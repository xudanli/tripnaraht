/**
 * Registration Seed → Traveler Memory Contract 草稿。
 */

import type { WriteTravelerMemoryRequestV1 } from './traveler-memory-contract.types';
import type { RegistrationSeedRequestV1 } from './registration-seed.types';

const PACES = new Set(['SLOW', 'MODERATE', 'FAST']);
const RISKS = new Set(['LOW', 'MEDIUM', 'HIGH']);
const PHILOSOPHIES = new Set(['SCENIC', 'ADVENTURE', 'RELAXED']);

export type RegistrationSeedValidation =
  | { ok: true; drafts: WriteTravelerMemoryRequestV1[] }
  | { ok: false; reason: string };

function cleanStrings(raw: unknown, max = 12): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    const s = String(item ?? '').trim();
    if (!s) continue;
    out.push(s.slice(0, 64));
    if (out.length >= max) break;
  }
  return out;
}

/**
 * 校验并投影为 EXPLICIT confirm 写入草稿（GLOBAL_USER）。
 */
export function buildRegistrationSeedWrites(
  userId: string,
  seed: RegistrationSeedRequestV1,
): RegistrationSeedValidation {
  const id = userId.trim();
  if (!id) return { ok: false, reason: 'userId_required' };

  const drafts: WriteTravelerMemoryRequestV1[] = [];
  const evidence = (key: string) => [
    { type: 'USER_EXPLICIT' as const, id: `registration_seed:${id}:${key}` },
  ];

  if (seed.pace != null) {
    const pace = String(seed.pace).trim().toUpperCase();
    if (!PACES.has(pace)) {
      return { ok: false, reason: 'invalid_pace' };
    }
    drafts.push({
      subject_id: id,
      domain: 'PACE',
      semantic_type: 'PREFERENCE',
      key: 'pace',
      value: pace,
      scope: 'GLOBAL_USER',
      source: ['EXPLICIT'],
      explicitConfirm: true,
      confidence: 0.95,
      override_policy: 'L2_WINS',
      evidence_refs: evidence('pace'),
    });
  }

  if (seed.riskTolerance != null) {
    const risk = String(seed.riskTolerance).trim().toUpperCase();
    if (!RISKS.has(risk)) {
      return { ok: false, reason: 'invalid_riskTolerance' };
    }
    drafts.push({
      subject_id: id,
      domain: 'DECISION_STYLE',
      semantic_type: 'PREFERENCE',
      key: 'risk_tolerance',
      value: risk,
      scope: 'GLOBAL_USER',
      source: ['EXPLICIT'],
      explicitConfirm: true,
      confidence: 0.95,
      override_policy: 'L2_WINS',
      evidence_refs: evidence('risk_tolerance'),
    });
  }

  if (seed.dietaryRestrictions != null) {
    const diet = cleanStrings(seed.dietaryRestrictions);
    if (diet.length === 0) {
      return { ok: false, reason: 'dietaryRestrictions_empty' };
    }
    drafts.push({
      subject_id: id,
      domain: 'FOOD',
      semantic_type: 'CONSTRAINT',
      key: 'dietary_restrictions',
      value: diet,
      scope: 'GLOBAL_USER',
      source: ['EXPLICIT'],
      explicitConfirm: true,
      confidence: 0.98,
      sensitivity: 'SENSITIVE',
      override_policy: 'L1_ONLY',
      evidence_refs: evidence('dietary_restrictions'),
    });
  }

  if (seed.maxDailyDrivingHours != null) {
    const hours = Number(seed.maxDailyDrivingHours);
    if (!Number.isFinite(hours) || hours <= 0 || hours > 16) {
      return { ok: false, reason: 'invalid_maxDailyDrivingHours' };
    }
    drafts.push({
      subject_id: id,
      domain: 'MOBILITY',
      semantic_type: 'CONSTRAINT',
      key: 'max_daily_driving_hours',
      value: hours,
      scope: 'GLOBAL_USER',
      source: ['EXPLICIT'],
      explicitConfirm: true,
      confidence: 0.95,
      override_policy: 'L2_WINS',
      evidence_refs: evidence('max_daily_driving_hours'),
    });
  }

  if (seed.hotelAvoid != null) {
    const avoid = cleanStrings(seed.hotelAvoid);
    if (avoid.length === 0) {
      return { ok: false, reason: 'hotelAvoid_empty' };
    }
    drafts.push({
      subject_id: id,
      domain: 'STAY',
      semantic_type: 'AVOIDANCE',
      key: 'hotel_avoid',
      value: avoid,
      scope: 'GLOBAL_USER',
      source: ['EXPLICIT'],
      explicitConfirm: true,
      confidence: 0.9,
      override_policy: 'L2_WINS',
      evidence_refs: evidence('hotel_avoid'),
    });
  }

  if (seed.travelPhilosophy != null) {
    const ph = String(seed.travelPhilosophy).trim().toUpperCase();
    if (!PHILOSOPHIES.has(ph)) {
      return { ok: false, reason: 'invalid_travelPhilosophy' };
    }
    drafts.push({
      subject_id: id,
      domain: 'EXPERIENCE',
      semantic_type: 'PREFERENCE',
      key: 'travel_philosophy',
      value: ph,
      scope: 'GLOBAL_USER',
      source: ['EXPLICIT'],
      explicitConfirm: true,
      confidence: 0.9,
      override_policy: 'L2_WINS',
      evidence_refs: evidence('travel_philosophy'),
    });
  }

  if (drafts.length === 0) {
    return { ok: false, reason: 'empty_seed' };
  }

  return { ok: true, drafts };
}
