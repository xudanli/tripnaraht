/**
 * Shared proof → decision-checker evidence mapping (no projection-layer cycles).
 */

import type { FeasibilityProofDto } from '../types/trip-constraint-solver.types';
import type { DecisionCheckerEvidenceKind } from '../types/decision-checker.types';

export function mapProofEvidenceKind(proof: FeasibilityProofDto): DecisionCheckerEvidenceKind {
  const src = String(proof.evidenceSource ?? '').toLowerCase();
  const type = String(proof.evidenceType ?? '').toLowerCase();
  if (/osrm|route.?engine|travel-info|transport/.test(src) || /route|travel/.test(type)) {
    return 'route_engine';
  }
  if (/weather|wind|road_closure|closure/.test(src) || /weather|road/.test(type)) {
    return 'weather_road';
  }
  if (/opening.?hour|hours/.test(src) || type.includes('opening')) {
    return 'opening_hours';
  }
  if (/booking|reservation|inventory/.test(src) || /booking/.test(type)) {
    return 'inventory';
  }
  if (/persona|profiling|decision.?log|guardian/.test(src) || /persona|profiling/.test(type)) {
    return 'persona_trace';
  }
  if (
    type === 'poi_access_capacity' ||
    /poi.?access|safetravel|place\.ontology|destination.?knowledge/.test(src) ||
    /poi_access|ontology_rules/.test(type)
  ) {
    return 'destination_knowledge';
  }
  if (/historical|model|monte.?carlo|pomdp/.test(src)) {
    return 'historical_model';
  }
  return 'other';
}

export function mapProofReliability(proof: FeasibilityProofDto): 'high' | 'medium' | 'low' {
  const conf = proof.confidence;
  if (typeof conf === 'number') {
    if (conf >= 0.85) return 'high';
    if (conf >= 0.6) return 'medium';
    return 'low';
  }
  const src = String(proof.evidenceSource ?? '').toLowerCase();
  if (/osrm|route.?engine|user_confirmed|constraint-solver/.test(src)) return 'high';
  if (/readiness|coverage|decision/.test(src)) return 'medium';
  return 'low';
}
