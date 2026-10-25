/**
 * Traveler Memory predicate 编解码 + 旧 predicate 别名。
 *
 * 新写：traveler.{domain}.{semantic}.{key}
 * 旧读：travel.pace / decision.riskTolerance … → Contract 投影
 */

import type {
  TravelerMemoryDomain,
  TravelerMemorySemanticType,
} from '../effective-context/effective-traveler-context.types';
import {
  TRAVELER_MEMORY_DOMAINS,
  TRAVELER_MEMORY_PREDICATE_PREFIX,
  TRAVELER_MEMORY_SEMANTIC_TYPES,
} from './traveler-memory-contract.types';

export type TravelerMemoryPredicateParts = {
  domain: TravelerMemoryDomain;
  semantic_type: TravelerMemorySemanticType;
  key: string;
};

function isDomain(v: string): v is TravelerMemoryDomain {
  return (TRAVELER_MEMORY_DOMAINS as readonly string[]).includes(v);
}

function isSemantic(v: string): v is TravelerMemorySemanticType {
  return (TRAVELER_MEMORY_SEMANTIC_TYPES as readonly string[]).includes(v);
}

/** traveler.food.constraint.pork */
export function encodeTravelerMemoryPredicate(
  parts: TravelerMemoryPredicateParts,
): string {
  const domain = parts.domain.toLowerCase();
  const semantic = parts.semantic_type.toLowerCase();
  const key = parts.key.trim().toLowerCase().replace(/\s+/g, '_');
  return `${TRAVELER_MEMORY_PREDICATE_PREFIX}${domain}.${semantic}.${key}`;
}

export function decodeTravelerMemoryPredicate(
  predicate: string,
): TravelerMemoryPredicateParts | null {
  const raw = String(predicate ?? '').trim();
  if (!raw.startsWith(TRAVELER_MEMORY_PREDICATE_PREFIX)) return null;
  const rest = raw.slice(TRAVELER_MEMORY_PREDICATE_PREFIX.length);
  const parts = rest.split('.');
  if (parts.length < 3) return null;
  const domain = parts[0].toUpperCase();
  const semantic = parts[1].toUpperCase();
  const key = parts.slice(2).join('.');
  if (!isDomain(domain) || !isSemantic(semantic) || !key) return null;
  return { domain, semantic_type: semantic, key };
}

/** 旧 TMR / OS 谓词 → Contract 坐标（只读迁移） */
export const LEGACY_PREDICATE_TO_TRAVELER_MEMORY: Readonly<
  Record<string, TravelerMemoryPredicateParts>
> = {
  'travel.pace': {
    domain: 'PACE',
    semantic_type: 'PREFERENCE',
    key: 'pace',
  },
  'decision.riskTolerance': {
    domain: 'DECISION_STYLE',
    semantic_type: 'PREFERENCE',
    key: 'risk_tolerance',
  },
  'travel.accommodationMovement': {
    domain: 'STAY',
    semantic_type: 'PREFERENCE',
    key: 'accommodation_movement',
  },
  'travel.experiencePreference': {
    domain: 'EXPERIENCE',
    semantic_type: 'PREFERENCE',
    key: 'experience_preference',
  },
  'decision.planningStyle': {
    domain: 'DECISION_STYLE',
    semantic_type: 'HABIT',
    key: 'planning_style',
  },
  'travel.nightDriving': {
    domain: 'MOBILITY',
    semantic_type: 'CONSTRAINT',
    key: 'night_driving',
  },
  'travel.maxDailyDrivingMinutes': {
    domain: 'MOBILITY',
    semantic_type: 'HABIT',
    key: 'max_daily_driving_minutes',
  },
  'trip.temporaryConstraints': {
    domain: 'PACE',
    semantic_type: 'CONSTRAINT',
    key: 'temporary_constraints',
  },
};

export function resolvePredicateParts(
  predicate: string,
): TravelerMemoryPredicateParts | null {
  return (
    decodeTravelerMemoryPredicate(predicate) ??
    LEGACY_PREDICATE_TO_TRAVELER_MEMORY[predicate] ??
    null
  );
}
