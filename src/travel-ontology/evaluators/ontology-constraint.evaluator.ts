/**
 * TravelWorldFact → Ontology 约束评估（纯函数，§24 场景）
 */

import type { EntryEligibility } from '../contracts/core-entities.types';
import {
  TRAVEL_WORLD_PREDICATES,
  type TravelWorldFact,
} from '../contracts/travel-world-fact.types';
import type { OntologyConstraintEvaluation, OntologyConstraintResult } from './ontology-constraint.types';

const EVALUATOR_VERSION = '0.1.0';

function findFacts(facts: TravelWorldFact[], predicate: string): TravelWorldFact[] {
  return facts.filter((f) => f.predicate === predicate);
}

function findFact(
  facts: TravelWorldFact[],
  subjectType: string,
  predicate: string,
  subjectId?: string,
): TravelWorldFact | undefined {
  return facts.find(
    (f) =>
      f.subjectType === subjectType &&
      f.predicate === predicate &&
      (subjectId == null || f.subjectId === subjectId),
  );
}

function isExpired(fact: TravelWorldFact, nowMs: number): boolean {
  if (fact.freshness === 'EXPIRED') return true;
  if (fact.expiresAt && Date.parse(fact.expiresAt) < nowMs) return true;
  return false;
}

function evaluateVehicleRoute(facts: TravelWorldFact[]): OntologyConstraintResult[] {
  const results: OntologyConstraintResult[] = [];
  const drivetrain = findFact(facts, 'RentalVehicle', TRAVEL_WORLD_PREDICATES.HAS_DRIVETRAIN);
  const requiredCaps = findFacts(facts, TRAVEL_WORLD_PREDICATES.REQUIRED_VEHICLE_CAPABILITY);
  const prohibited = findFacts(facts, TRAVEL_WORLD_PREDICATES.PROHIBITED_ROAD_CLASS);

  if (drivetrain && requiredCaps.length > 0) {
    const vehicleDrive = String(drivetrain.value);
    for (const req of requiredCaps) {
      const needed = String(req.value);
      const rank = (d: string) => (d === '4WD' ? 3 : d === 'AWD' ? 2 : 1);
      if (rank(vehicleDrive) < rank(needed)) {
        results.push({
          severity: 'BLOCK',
          code: 'VEHICLE_CAPABILITY_MISMATCH',
          message: `车辆 ${vehicleDrive} 不满足路段 ${req.subjectId} 要求的 ${needed}`,
          affectedSubjectIds: [req.subjectId, drivetrain.subjectId],
        });
      }
    }
  }

  for (const p of prohibited) {
    results.push({
      severity: 'BLOCK',
      code: 'RENTAL_CONTRACT_ROAD_PROHIBITION',
      message: `租车合同禁止进入 ${String(p.value)} 类道路`,
      affectedSubjectIds: [p.subjectId],
    });
  }

  for (const road of findFacts(facts, TRAVEL_WORLD_PREDICATES.CURRENT_ROAD_STATUS)) {
    if (road.value === 'CLOSED' || road.value === 'IMPASSABLE') {
      results.push({
        severity: 'BLOCK',
        code: 'ROAD_STATUS_BLOCKED',
        message: `路段 ${road.subjectId} 当前不可通行 (${String(road.value)})`,
        affectedSubjectIds: [road.subjectId],
      });
    }
  }

  return results;
}

function evaluateInsurance(facts: TravelWorldFact[]): OntologyConstraintResult[] {
  const results: OntologyConstraintResult[] = [];
  const covered = findFact(facts, 'InsurancePolicy', TRAVEL_WORLD_PREDICATES.COVERS_DAMAGE_CAUSE);
  const excluded = findFact(facts, 'InsurancePolicy', TRAVEL_WORLD_PREDICATES.EXCLUDES_DAMAGE_CAUSE);
  const riverCrossing = facts.find((f) => f.predicate === 'route.hasRiverCrossing' && f.value === true);

  const coveredList = Array.isArray(covered?.value) ? (covered!.value as string[]) : [];
  const excludedList = Array.isArray(excluded?.value) ? (excluded!.value as string[]) : [];

  if (riverCrossing) {
    if (!coveredList.includes('waterCrossing') || excludedList.includes('waterCrossing')) {
      results.push({
        severity: 'WARNING',
        code: 'INSURANCE_WATER_CROSSING_GAP',
        message: '计划路线存在涉水风险，保险涉水保障未确认或被除外',
        affectedSubjectIds: [riverCrossing.subjectId],
      });
    }
    if (!coveredList.includes('undercarriage')) {
      results.push({
        severity: 'MISSING_EVIDENCE',
        code: 'INSURANCE_UNDERCARRIAGE_UNKNOWN',
        message: '底盘损失保障范围尚未确认',
      });
    }
  }

  return results;
}

function evaluateWindCamper(facts: TravelWorldFact[]): OntologyConstraintResult[] {
  const results: OntologyConstraintResult[] = [];
  const vehicleClass = findFact(facts, 'RentalVehicle', 'mobility.vehicleClass');
  const warnings = findFacts(facts, TRAVEL_WORLD_PREDICATES.WEATHER_WARNING_LEVEL);

  if (
    vehicleClass &&
    String(vehicleClass.value).includes('HIGH_ROOF') &&
    warnings.some((w) => ['ORANGE', 'RED'].includes(String(w.value)))
  ) {
    results.push({
      severity: 'WARNING',
      code: 'WIND_HIGH_ROOF_VEHICLE_RISK',
      message: '强风预警下高顶车辆侧风风险升高',
      affectedSubjectIds: warnings.map((w) => w.subjectId),
    });
  }

  return results;
}

function evaluateEntry(facts: TravelWorldFact[]): OntologyConstraintResult[] {
  const results: OntologyConstraintResult[] = [];
  const eligibility = findFact(facts, 'Traveler', TRAVEL_WORLD_PREDICATES.ENTRY_ELIGIBILITY);

  if (!eligibility) return results;

  const payload = eligibility.value as EntryEligibility;
  if (payload.status === 'UNKNOWN' || payload.status === 'NEEDS_ACTION') {
    results.push({
      severity: 'BLOCK',
      code: 'ENTRY_ELIGIBILITY_UNKNOWN',
      message: '入境资格尚未确认，不可进入可预订确认状态',
      affectedSubjectIds: [eligibility.subjectId],
    });
  }

  if (payload.visaRequired && payload.status !== 'ELIGIBLE') {
    results.push({
      severity: 'MISSING_EVIDENCE',
      code: 'VISA_STATUS_UNCONFIRMED',
      message: '需要签证但尚未确认有效签证证据',
      affectedSubjectIds: [eligibility.subjectId],
    });
  }

  return results;
}

function parseTimeOnDate(iso: string): number | null {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

function evaluateRentalPickup(facts: TravelWorldFact[]): OntologyConstraintResult[] {
  const results: OntologyConstraintResult[] = [];
  const arrival = findFact(facts, 'Flight', 'transport.scheduledArrival');
  const counterHours = findFact(facts, 'RentalContract', 'rental.counterHours');
  const afterHours = findFact(facts, 'RentalContract', 'rental.afterHoursPickupConfirmed');

  if (!arrival || !counterHours) return results;

  const arrivalMs = parseTimeOnDate(String(arrival.value));
  const hours = counterHours.value as { open?: string; close?: string; timezone?: string };
  if (arrivalMs == null || !hours.close) return results;

  const arrivalDate = new Date(arrivalMs);
  const [closeH, closeM] = hours.close.split(':').map(Number);
  const counterClose = new Date(arrivalDate);
  counterClose.setHours(closeH, closeM ?? 0, 0, 0);

  if (arrivalMs > counterClose.getTime()) {
    results.push({
      severity: 'BLOCK',
      code: 'RENTAL_PICKUP_WINDOW_CONFLICT',
      message: '航班到达时间晚于租车柜台营业时间',
      affectedSubjectIds: [arrival.subjectId, counterHours.subjectId],
    });

    if (afterHours?.value === false) {
      results.push({
        severity: 'WARNING',
        code: 'AFTER_HOURS_PICKUP_UNCONFIRMED',
        message: '订单未确认夜间/非营业时间取车方式',
        affectedSubjectIds: [afterHours.subjectId],
      });
    }
  }

  return results;
}

/** 评估全部 Ontology 约束（跳过已过期事实） */
export function evaluateOntologyConstraints(
  facts: TravelWorldFact[],
  nowMs = Date.now(),
): OntologyConstraintEvaluation {
  const active = facts.filter((f) => !isExpired(f, nowMs));

  const results: OntologyConstraintResult[] = [
    ...evaluateVehicleRoute(active),
    ...evaluateInsurance(active),
    ...evaluateWindCamper(active),
    ...evaluateEntry(active),
    ...evaluateRentalPickup(active),
  ];

  return {
    results,
    evaluatedAt: new Date(nowMs).toISOString(),
  };
}

export const ONTOLOGY_CONSTRAINT_EVALUATOR = {
  engine: 'travel-ontology-evaluator',
  version: EVALUATOR_VERSION,
};
