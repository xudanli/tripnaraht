/**
 * Seed result → Arrange input (Preview→Confirm→Apply contract; never PlanVersion).
 */

import { Injectable } from '@nestjs/common';
import type {
  InitialPlanArrangeInput,
  InitialPlanSeedResult,
  SeededPlanItemEvidence,
} from '../types/iceland-initial-plan-seed.types';

@Injectable()
export class IcelandInitialPlanArrangeProjector {
  project(seed: InitialPlanSeedResult, tripId: string): InitialPlanArrangeInput {
    const softAlternativePairs: InitialPlanArrangeInput['softAlternativePairs'] = [];
    const coVisitClusters: InitialPlanArrangeInput['coVisitClusters'] = [];
    const parentChild: InitialPlanArrangeInput['parentChild'] = [];

    for (const rel of seed.relations) {
      if (rel.relationType === 'SOFT_ALTERNATIVE' && rel.memberCanonicalPlaceIds.length >= 2) {
        softAlternativePairs.push({
          groupId: rel.groupId,
          placeIds: [
            rel.memberCanonicalPlaceIds[0]!,
            rel.memberCanonicalPlaceIds[1]!,
          ],
          policy: 'ALLOW_BOTH',
        });
      }
      if (rel.relationType === 'CO_VISIT_CLUSTER') {
        coVisitClusters.push({
          groupId: rel.groupId,
          placeIds: rel.memberCanonicalPlaceIds,
        });
      }
      if (
        rel.relationType === 'PARENT_CHILD' &&
        rel.memberCanonicalPlaceIds.length >= 2
      ) {
        parentChild.push({
          parentId: rel.memberCanonicalPlaceIds[0]!,
          childId: rel.memberCanonicalPlaceIds[1]!,
        });
      }
    }

    const attractionCandidates = seed.candidateEntities
      .filter(
        (c) =>
          c.kind === 'ATTRACTION' ||
          c.kind === 'ATTRACTION_AREA' ||
          c.countsTowardAttractionCoverage,
      )
      .map((c) => {
        const excludedAlternatives = this.softAltExclusions(c, seed);
        const evidence: SeededPlanItemEvidence = {
          source: c.selectedBecause.includes('user_request')
            ? 'USER_REQUEST'
            : 'GOLDEN_SET',
          regionId: c.regionId,
          subregionId: c.subregionId,
          coverageRole: c.coverageRole,
          canonicalPlaceId: c.canonicalPlaceId,
          selectedBecause: c.selectedBecause,
          excludedAlternatives,
          gateOutcome: c.gateOutcome,
        };
        return {
          canonicalPlaceId: c.canonicalPlaceId,
          label: c.label,
          regionId: c.regionId,
          packId: c.packId,
          subregionId: c.subregionId,
          coverageRole: c.coverageRole,
          score: c.score,
          countsTowardAttractionCoverage: c.countsTowardAttractionCoverage,
          relationGroupIds: c.relationGroupIds,
          parentCanonicalPlaceId: c.parentCanonicalPlaceId,
          evidence,
        };
      });

    const supportNodes = seed.candidateEntities
      .filter(
        (c) =>
          c.kind === 'TOWN_HUB' ||
          c.kind === 'LODGING' ||
          c.kind === 'SERVICE' ||
          c.kind === 'ROUTE_ANCHOR',
      )
      .map((c) => ({
        canonicalPlaceId: c.canonicalPlaceId,
        label: c.label,
        regionId: c.regionId,
        packId: c.packId,
        entityType: c.entityType,
      }));

    return {
      tripId,
      writesPlanVersion: false,
      requiresPreviewConfirmApply: true,
      attractionCandidates,
      supportNodes,
      experienceCandidates: seed.experienceCandidates,
      relations: seed.relations,
      dayScopeRules: seed.dayScopeRules,
      softAlternativePairs,
      coVisitClusters,
      parentChild,
      unresolvedEntities: seed.unresolvedEntities,
      catalogGaps: seed.catalogGaps,
      confirmedLodgings: seed.confirmedLodgings,
      originGateway: seed.originGateway,
      exitGateway: seed.exitGateway,
      evidence: [
        ...seed.evidence,
        {
          type: 'ARRANGE_PROJECTOR',
          message:
            'Arrange input projected from Golden Set seed; Apply must use Preview→Confirm→Apply',
        },
      ],
    };
  }

  /**
   * When time is tight, keep higher-score member of a soft-alternative pair.
   * Returns filtered arrange input + evidence of drop — does not hard-mutex at seed.
   */
  applySoftAlternativeTimePressure(
    arrange: InitialPlanArrangeInput,
    opts: { maxAttractions?: number },
  ): InitialPlanArrangeInput {
    const max = opts.maxAttractions ?? Number.POSITIVE_INFINITY;
    let attrs = [...arrange.attractionCandidates].sort((a, b) => b.score - a.score);
    const droppedEvidence = [...arrange.evidence];

    for (const pair of arrange.softAlternativePairs) {
      const [a, b] = pair.placeIds;
      const ca = attrs.find((x) => x.canonicalPlaceId === a);
      const cb = attrs.find((x) => x.canonicalPlaceId === b);
      if (!ca || !cb) continue;
      if (attrs.length <= max) continue;
      // Prefer higher score when under pressure
      const drop = ca.score >= cb.score ? cb : ca;
      const keep = ca.score >= cb.score ? ca : cb;
      attrs = attrs.filter((x) => x.canonicalPlaceId !== drop.canonicalPlaceId);
      keep.evidence.excludedAlternatives = [
        ...(keep.evidence.excludedAlternatives ?? []),
        {
          entityId: String(drop.canonicalPlaceId),
          reasons: ['SOFT_ALTERNATIVE_TIME_PRESSURE', `kept_higher_score=${keep.score}`],
        },
      ];
      droppedEvidence.push({
        type: 'SOFT_ALTERNATIVE_TRIM',
        message: `Trimmed ${drop.canonicalPlaceId} in favor of ${keep.canonicalPlaceId}`,
        meta: { groupId: pair.groupId },
      });
    }

    // Global trim if still over max
    if (attrs.length > max) {
      const kept = attrs.slice(0, max);
      const removed = attrs.slice(max);
      for (const r of removed) {
        droppedEvidence.push({
          type: 'CAPACITY_TRIM',
          message: `Trimmed attraction ${r.canonicalPlaceId} due to capacity`,
        });
      }
      attrs = kept;
    }

    return { ...arrange, attractionCandidates: attrs, evidence: droppedEvidence };
  }

  private softAltExclusions(
    c: InitialPlanSeedResult['candidateEntities'][number],
    seed: InitialPlanSeedResult,
  ): SeededPlanItemEvidence['excludedAlternatives'] {
    const out: NonNullable<SeededPlanItemEvidence['excludedAlternatives']> = [];
    for (const rel of seed.relations) {
      if (rel.relationType !== 'SOFT_ALTERNATIVE') continue;
      if (!rel.memberCanonicalPlaceIds.includes(c.canonicalPlaceId)) continue;
      for (const other of rel.memberCanonicalPlaceIds) {
        if (other === c.canonicalPlaceId) continue;
        const excl = seed.exclusions.find((e) => e.placeId === other);
        if (excl) {
          out.push({
            entityId: String(other),
            reasons: [excl.reason, excl.detail ?? ''].filter(Boolean),
          });
        }
      }
    }
    return out.length ? out : undefined;
  }
}
