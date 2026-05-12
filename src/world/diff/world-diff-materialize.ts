/**
 * WorldDiff Contract → ConstraintField（SSOT 条目）；不含业务策略，仅语义映射。
 */

import type {
  ConstraintField,
  WorldConstraintState,
} from '../constraint-field.interface';
import type { WorldDiff } from './world-diff.contract';

function severityBandToScore(band: WorldDiff['severity']): number {
  if (band === 'HIGH') {
    return 85;
  }
  if (band === 'MEDIUM') {
    return 55;
  }
  return 30;
}

function parseRoadState(s: string): WorldConstraintState {
  const u = s.toUpperCase();
  if (u.includes('OPEN') && !u.includes('UNKNOWN')) {
    return 'OPEN';
  }
  if (u.includes('RESTRICT') || u.includes('4WD') || u.includes('4X4')) {
    return 'RESTRICTED';
  }
  if (u.includes('CLOSE') || u.includes('IMPASS')) {
    return 'CLOSED';
  }
  if (u.includes('DEGRAD')) {
    return 'DEGRADED';
  }
  return 'UNKNOWN';
}

function parseWeatherState(s: string): WorldConstraintState {
  const u = s.toUpperCase();
  if (u.includes('OPEN') || u === 'CLEAR') {
    return 'OPEN';
  }
  if (u.includes('HARD') || u.includes('BLOCK')) {
    return 'CLOSED';
  }
  if (u.includes('SOFT') || u.includes('RISK') || u.includes('DEGRAD')) {
    return 'DEGRADED';
  }
  return 'DEGRADED';
}

function parseBookingState(s: string): WorldConstraintState {
  const u = s.toUpperCase();
  if (u.includes('CANCEL')) {
    return 'CLOSED';
  }
  if (u.includes('PEND')) {
    return 'DEGRADED';
  }
  return 'OPEN';
}

function impactWeightFor(domain: WorldDiff['domain'], state: WorldConstraintState): number {
  if (domain === 'ROAD') {
    if (state === 'CLOSED') {
      return 1;
    }
    if (state === 'RESTRICTED') {
      return 0.75;
    }
    return 0.35;
  }
  if (domain === 'WEATHER') {
    return state === 'CLOSED' ? 0.95 : 0.55;
  }
  return state === 'CLOSED' ? 0.9 : 0.35;
}

/**
 * 将统一合约落成单条 `ConstraintField`（写入前由 `WorldConstraintStore.upsert` 盖章 version）。
 */
export function worldDiffToConstraintField(diff: WorldDiff): ConstraintField | undefined {
  const sev = severityBandToScore(diff.severity);
  const effectiveAfter =
    diff.type === 'CONSTRAINT_REMOVED' ? 'OPEN' : diff.stateAfter;

  switch (diff.domain) {
    case 'ROAD': {
      const state = parseRoadState(effectiveAfter);
      return {
        id: diff.entityId.trim(),
        type: 'ROAD',
        state,
        severity: sev,
        temporalScope: diff.temporalScope,
        impactWeight: impactWeightFor('ROAD', state),
        version: 0,
        ...(diff.impactedSlots.length > 0
          ? { affectedSlotIds: [...diff.impactedSlots] }
          : {}),
      };
    }
    case 'WEATHER': {
      const state = parseWeatherState(effectiveAfter);
      return {
        id: diff.entityId.trim(),
        type: 'WEATHER',
        state,
        severity: sev,
        temporalScope: diff.temporalScope,
        impactWeight: Math.min(1, sev / 100),
        version: 0,
      };
    }
    case 'BOOKING': {
      const state = parseBookingState(effectiveAfter);
      return {
        id: diff.entityId.trim(),
        type: 'BOOKING',
        state,
        severity: sev,
        temporalScope: diff.temporalScope,
        impactWeight: state === 'CLOSED' ? 0.9 : 0.35,
        version: 0,
      };
    }
    default: {
      const _e: never = diff.domain;
      return _e;
    }
  }
}
