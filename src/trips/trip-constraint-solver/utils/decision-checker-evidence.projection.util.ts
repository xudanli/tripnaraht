/**
 * Decision checker evidence — project all itinerary POIs for focus day (incl. missing).
 */

import type { PoiCoverage, EvidenceType } from '../../readiness/types/coverage-map.types';
import type { PlanningConflictItem } from '../types/planning-conflicts.types';
import type {
  DecisionCheckerEvidenceItemDto,
  DecisionCheckerEvidenceKind,
} from '../types/decision-checker.types';
import type {
  FeasibilityDayTimelineDto,
  FeasibilityIssueDto,
  FeasibilityProofDto,
} from '../types/trip-constraint-solver.types';
import {
  mapProofEvidenceKind,
  mapProofReliability,
} from './decision-checker-evidence-mapping.util';
import {
  buildPlanObjectEvidenceRefs,
  isPlanObjectSemanticKey,
  planObjectRuleSubtitle,
} from '../../../decision-runtime/constraints/utils/plan-object-evidence-display.util';
import { PLAN_OBJECT_ENGINE } from '../../../decision-runtime/constraints/adapters/plan-object-assessment-to-assertion.adapter';

function evidenceTypeLabel(type: EvidenceType | string): string {
  switch (type) {
    case 'weather':
      return '天气';
    case 'road_closure':
      return '道路封闭';
    case 'opening_hours':
      return '营业时间';
    case 'booking_confirmation':
      return '预约确认';
    case 'permit':
      return '许可证';
    default:
      return String(type);
  }
}

function evidenceTypeToKind(type: EvidenceType | string): DecisionCheckerEvidenceKind {
  switch (type) {
    case 'opening_hours':
      return 'opening_hours';
    case 'booking_confirmation':
      return 'inventory';
    case 'weather':
    case 'road_closure':
      return 'weather_road';
    default:
      return 'other';
  }
}

function evidenceStatusFact(type: EvidenceType | string, fetched: boolean): string {
  const label = evidenceTypeLabel(type);
  return fetched ? `${label}证据已获取` : `${label}证据未获取`;
}

function observedAtForPoiEvidence(poi: PoiCoverage, type: EvidenceType): string | undefined {
  const metadata = (poi.metadata ?? {}) as Record<string, unknown>;
  switch (type) {
    case 'weather':
      return (
        (metadata.weatherFetchedAt as string | undefined) ??
        (metadata.weatherInfo as { lastUpdated?: string } | undefined)?.lastUpdated ??
        (metadata.weather as { lastUpdated?: string } | undefined)?.lastUpdated
      );
    case 'road_closure':
      return (
        (metadata.roadStatusFetchedAt as string | undefined) ??
        (metadata.roadStatus as { lastUpdated?: string } | undefined)?.lastUpdated
      );
    case 'opening_hours':
      return metadata.openingHoursUpdatedAt as string | undefined;
    case 'booking_confirmation':
      return (
        (metadata.bookingConfirmationUpdatedAt as string | undefined) ??
        (metadata.bookingConfirmation as { updatedAt?: string } | undefined)?.updatedAt ??
        (metadata.booking as { updatedAt?: string } | undefined)?.updatedAt
      );
    default:
      return undefined;
  }
}

function publisherForPoiEvidence(poi: PoiCoverage, type: EvidenceType): string | undefined {
  const metadata = (poi.metadata ?? {}) as Record<string, unknown>;
  switch (type) {
    case 'weather':
      return (
        (metadata.weatherInfo as { source?: string } | undefined)?.source ??
        (metadata.weather as { source?: string } | undefined)?.source ??
        'Place.metadata.weatherInfo'
      );
    case 'road_closure':
      return (
        (metadata.roadStatus as { source?: string } | undefined)?.source ?? 'Place.metadata.roadStatus'
      );
    case 'opening_hours':
      return (metadata.openingHoursSource as string | undefined) ?? 'Place.metadata.openingHours';
    case 'booking_confirmation':
      return (
        (metadata.bookingConfirmationSource as string | undefined) ??
        'Place.metadata.bookingConfirmation'
      );
    default:
      return '覆盖地图';
  }
}

function collectPoiEvidenceTypes(poi: PoiCoverage): EvidenceType[] {
  const types = new Set<EvidenceType>();
  for (const t of poi.evidenceTypes ?? []) types.add(t);
  for (const t of poi.missingEvidence ?? []) types.add(t);
  return [...types];
}

function proofToEvidenceItem(proof: FeasibilityProofDto, index: number, issueId: string): DecisionCheckerEvidenceItemDto {
  const kind = mapProofEvidenceKind(proof);
  const publisher = proof.evidenceSource?.trim() || undefined;

  const isPlanObjectProof =
    proof.evidenceSource === PLAN_OBJECT_ENGINE ||
    Boolean(proof.semanticKey) ||
    isPlanObjectSemanticKey(proof.entity);

  if (isPlanObjectProof) {
    const refs = buildPlanObjectEvidenceRefs(proof);
    return {
      id: `ev_${issueId}_${index}`,
      kind,
      title: proof.currentFact?.trim() || proof.placeLabel?.trim() || '日内评估',
      subtitle: planObjectRuleSubtitle(proof.ruleId),
      reliability: mapProofReliability(proof),
      observedAt: proof.observedAt,
      publisher: publisher ?? 'PlanObject 日内评估',
      confidence: proof.confidence,
      refs: refs.length ? refs : undefined,
    };
  }

  const refs: DecisionCheckerEvidenceItemDto['refs'] = [];
  if (proof.itemId) refs.push({ type: 'trip_item', id: proof.itemId });
  if (proof.ruleId) refs.push({ type: 'rule', id: proof.ruleId });

  return {
    id: `ev_${issueId}_${index}`,
    kind,
    title: proof.placeLabel?.trim() || proof.entity?.trim() || '行程项',
    subtitle: proof.currentFact?.trim() || proof.conclusion?.trim() || proof.constraint,
    reliability: mapProofReliability(proof),
    observedAt: proof.observedAt,
    publisher,
    confidence: proof.confidence,
    refs: refs.length ? refs : undefined,
  };
}

export function resolveDecisionCheckerEvidenceFocusDay(input: {
  issue?: FeasibilityIssueDto;
  planningConflicts?: PlanningConflictItem[];
  focusConflictId?: string;
  dayTimeline?: FeasibilityDayTimelineDto[];
}): number | undefined {
  if (input.focusConflictId) {
    const conflict = input.planningConflicts?.find((c) => c.id === input.focusConflictId);
    if (conflict?.affectedDays?.[0]) return conflict.affectedDays[0];
  }

  const issueDay =
    input.issue?.affectedDays?.[0] ??
    input.issue?.anchors?.fromDayNumber ??
    input.issue?.anchors?.toDayNumber;
  if (issueDay != null) return issueDay;

  const conflictDay = input.planningConflicts?.find((c) => c.affectedDays?.length)?.affectedDays?.[0];
  if (conflictDay != null) return conflictDay;

  const timelineDay = input.dayTimeline?.find((d) => d.issueIds.length > 0)?.dayNumber;
  return timelineDay;
}

export function projectPoiEvidenceItem(
  poi: PoiCoverage,
  type: EvidenceType,
  calculatedAt?: string,
): DecisionCheckerEvidenceItemDto {
  const fetched = poi.evidenceTypes?.includes(type) ?? false;
  const kind = evidenceTypeToKind(type);
  const observedAt = observedAtForPoiEvidence(poi, type) ?? calculatedAt;

  return {
    id: `ev_poi_${poi.itemId ?? poi.id}_${type}`,
    kind,
    title: poi.name,
    subtitle: evidenceStatusFact(type, fetched),
    reliability: fetched ? (poi.coverageStatus === 'covered' ? 'high' : 'medium') : 'low',
    observedAt,
    publisher: publisherForPoiEvidence(poi, type),
    confidence: fetched ? 0.85 : 0.55,
    refs: poi.itemId ? [{ type: 'trip_item', id: poi.itemId }] : undefined,
  };
}

export function projectDayItineraryEvidenceItems(
  pois: PoiCoverage[],
  dayNumber: number,
  calculatedAt?: string,
): DecisionCheckerEvidenceItemDto[] {
  const dayPois = pois.filter((p) => p.day === dayNumber).sort((a, b) => a.order - b.order);
  const items: DecisionCheckerEvidenceItemDto[] = [];

  for (const poi of dayPois) {
    const types = collectPoiEvidenceTypes(poi);
    if (!types.length) {
      items.push({
        id: `ev_poi_${poi.itemId ?? poi.id}_summary`,
        kind: 'other',
        title: poi.name,
        subtitle: '证据未获取',
        reliability: 'low',
        observedAt: calculatedAt,
        publisher: '覆盖地图',
        confidence: 0.5,
        refs: poi.itemId ? [{ type: 'trip_item', id: poi.itemId }] : undefined,
      });
      continue;
    }

    for (const type of types) {
      items.push(projectPoiEvidenceItem(poi, type, calculatedAt));
    }
  }

  return items;
}

function evidenceItemMergeKey(item: DecisionCheckerEvidenceItemDto): string {
  const itemRef = item.refs?.find((r) => r.type === 'trip_item')?.id;
  return `${itemRef ?? item.title}:${item.kind}`;
}

export function mergeDecisionCheckerEvidenceItems(
  primary: DecisionCheckerEvidenceItemDto[],
  overlays: DecisionCheckerEvidenceItemDto[],
): DecisionCheckerEvidenceItemDto[] {
  const byKey = new Map<string, DecisionCheckerEvidenceItemDto>();
  for (const item of primary) {
    byKey.set(evidenceItemMergeKey(item), item);
  }
  for (const item of overlays) {
    byKey.set(evidenceItemMergeKey(item), item);
  }
  return [...byKey.values()];
}

export function collectIssueProofEvidenceItems(
  issue?: FeasibilityIssueDto,
  allIssues?: FeasibilityIssueDto[],
  focusDay?: number,
): DecisionCheckerEvidenceItemDto[] {
  const items: DecisionCheckerEvidenceItemDto[] = [];
  const sources = issue ? [issue, ...(allIssues ?? []).filter((i) => i.id !== issue.id)] : allIssues ?? [];

  for (const src of sources) {
    if (focusDay != null) {
      const days = src.affectedDays ?? [];
      if (days.length > 0 && !days.includes(focusDay)) continue;
    }

    for (let i = 0; i < (src.proofs?.length ?? 0); i++) {
      const proof = src.proofs![i];
      items.push(proofToEvidenceItem(proof, i, src.id));
    }
  }

  return items;
}

/** Destination knowledge / POI access / planB hints from planning conflict focus */
export function collectDestinationKnowledgeEvidenceItems(
  conflicts: PlanningConflictItem[] | undefined,
  focusConflictId?: string,
): DecisionCheckerEvidenceItemDto[] {
  if (!conflicts?.length) return [];

  const focus =
    (focusConflictId
      ? conflicts.find(
          (c) =>
            c.id === focusConflictId ||
            c.semanticKey === focusConflictId ||
            c.issue?.id === focusConflictId,
        )
      : undefined) ?? conflicts[0];

  if (!focus?.issue) return [];

  const items: DecisionCheckerEvidenceItemDto[] = [];
  const issue = focus.issue;
  const poiSlug = issue.visitorAccess?.evaluation?.poiId;

  if (issue.visitorAccess?.evaluation?.message) {
    items.push({
      id: `dk_${focus.id}_eval`,
      kind: 'destination_knowledge',
      title: issue.title || focus.title,
      subtitle: issue.visitorAccess.evaluation.message,
      reliability: issue.visitorAccess.evaluation.confidence === 'OFFICIAL' ? 'high' : 'medium',
      publisher: 'POI Access Engine',
      confidence: 0.85,
      refs: poiSlug ? [{ type: 'poi_slug', id: poiSlug }] : [{ type: 'conflict', id: focus.id }],
    });
  }

  for (const [i, hint] of (issue.visitorAccess?.evaluation?.planBHints ?? []).entries()) {
    items.push({
      id: `dk_${focus.id}_planb_${i}`,
      kind: 'destination_knowledge',
      title: hint.action,
      subtitle: hint.detail,
      reliability: 'medium',
      publisher: 'POI Access · Plan B',
      refs: poiSlug ? [{ type: 'poi_slug', id: poiSlug }] : undefined,
    });
  }

  for (let i = 0; i < (issue.proofs?.length ?? 0); i++) {
    const proof = issue.proofs![i];
    if (mapProofEvidenceKind(proof) !== 'destination_knowledge') continue;
    items.push(proofToEvidenceItem(proof, i, issue.id));
  }

  return items;
}

export function collectDecisionCheckerEvidenceItems(input: {
  issue?: FeasibilityIssueDto;
  allIssues?: FeasibilityIssueDto[];
  coveragePois?: PoiCoverage[];
  coverageCalculatedAt?: string;
  focusDay?: number;
  planningConflicts?: PlanningConflictItem[];
  focusConflictId?: string;
  dayTimeline?: FeasibilityDayTimelineDto[];
}): DecisionCheckerEvidenceItemDto[] {
  const focusDay =
    input.focusDay ??
    resolveDecisionCheckerEvidenceFocusDay({
      issue: input.issue,
      planningConflicts: input.planningConflicts,
      focusConflictId: input.focusConflictId,
      dayTimeline: input.dayTimeline,
    });

  if (input.coveragePois?.length && focusDay != null) {
    const dayItems = projectDayItineraryEvidenceItems(
      input.coveragePois,
      focusDay,
      input.coverageCalculatedAt,
    );
    const proofItems = collectIssueProofEvidenceItems(input.issue, input.allIssues, focusDay);
    const knowledgeItems = collectDestinationKnowledgeEvidenceItems(
      input.planningConflicts,
      input.focusConflictId,
    );
    return mergeDecisionCheckerEvidenceItems(
      dayItems,
      mergeDecisionCheckerEvidenceItems(proofItems, knowledgeItems),
    );
  }

  const proofItems = collectIssueProofEvidenceItems(input.issue, input.allIssues);
  const knowledgeItems = collectDestinationKnowledgeEvidenceItems(
    input.planningConflicts,
    input.focusConflictId,
  );
  return mergeDecisionCheckerEvidenceItems(proofItems, knowledgeItems).slice(0, 12);
}
