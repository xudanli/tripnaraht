/**
 * Golden Set → Initial Plan candidates (not activities, not PlanVersion).
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { DateTime } from 'luxon';
import {
  getRegionPack,
  packsForWizardRegion,
} from '../packs/iceland-region-pack.registry';
import type { IcelandRegionEntityRef, IcelandRegionPlanningPack } from '../types/iceland-region-planning-pack.types';
import type {
  ExperienceCandidate,
  GateOutcome,
  InitialPlanSeedInput,
  InitialPlanSeedResult,
  RegionSelection,
  SeedCandidate,
  SeedEvidence,
  SeedExclusion,
  CatalogResolutionIssue,
  RegionalCatalogGapIssue,
} from '../types/iceland-initial-plan-seed.types';
import {
  IcelandGoldenSetCatalogResolver,
  type ResolvedCatalogPlace,
} from './iceland-golden-set-catalog-resolver.service';

@Injectable()
export class IcelandInitialPlanSeedService {
  private readonly logger = new Logger(IcelandInitialPlanSeedService.name);

  constructor(
    @Optional() private readonly catalogResolver?: IcelandGoldenSetCatalogResolver,
  ) {}

  async seed(input: InitialPlanSeedInput): Promise<InitialPlanSeedResult> {
    const dayCount = this.countDays(input.travelDates.startDate, input.travelDates.endDate);
    const season = input.seasonOverride ?? this.inferSeason(input.travelDates.startDate);
    const excludeSet = new Set([
      ...(input.preferences?.excludePlaceIds ?? []),
    ]);
    const mustInclude = new Set([
      ...(input.preferences?.mustIncludePlaceIds ?? []),
      ...(input.requestedPlaces ?? [])
        .map((p) => p.placeId)
        .filter((id): id is number => typeof id === 'number'),
    ]);

    const evidence: SeedEvidence[] = [];
    const exclusions: SeedExclusion[] = [];
    const unresolvedEntities: CatalogResolutionIssue[] = [];
    const catalogGaps: RegionalCatalogGapIssue[] = [];
    const selectedRegions: RegionSelection[] = [];

    const packs = this.selectPacks(input.regionIds, dayCount, evidence, exclusions);
    for (const regionId of [...new Set(input.regionIds)]) {
      if (regionId === 'ring_road') {
        selectedRegions.push({
          regionId,
          packIds: ['ring_road'],
          coverageStatus: 'CORRIDOR_ONLY',
          regionalGoldenSetReady: false,
          subregionIds: [],
          selectedBecause: ['corridor_preference'],
        });
        continue;
      }
      const regionPacks = packs.filter((p) => p.wizardRegionIds.includes(regionId));
      selectedRegions.push({
        regionId,
        packIds: regionPacks.map((p) => p.packId),
        coverageStatus: regionPacks[0]?.coverageStatus ?? 'EXPERIMENTAL',
        regionalGoldenSetReady: regionPacks.some((p) => p.regionalGoldenSetReady),
        subregionIds: regionPacks.flatMap((p) => p.subregions?.map((s) => s.subregionId) ?? []),
        selectedBecause: regionPacks.length
          ? ['wizard_regionIds', 'golden_set_pack']
          : ['no_pack'],
      });
      if (
        regionPacks.some((p) => p.coverageStatus === 'CORRIDOR_ONLY') ||
        regionPacks.some((p) => !p.regionalGoldenSetReady)
      ) {
        if (regionId === 'east_fjords') {
          catalogGaps.push({
            issueType: 'REGIONAL_CATALOG_GAP',
            regionId: 'east_fjords',
            missingCapabilities: ['SIGNATURE_ATTRACTIONS'],
            severity: 'WARNING',
          });
          evidence.push({
            type: 'REGIONAL_CATALOG_GAP',
            regionId: 'east_fjords',
            message: '东峡湾仅走廊能力，不参与景点覆盖验收',
          });
        }
      }
    }

    // Collect place ids for catalog resolution
    const placeHints: Array<{ placeId: number; expectedEntityType?: IcelandRegionEntityRef['entityType'] }> = [];
    for (const pack of packs) {
      for (const e of pack.entities) {
        if (typeof e.placeId === 'number') {
          placeHints.push({ placeId: e.placeId, expectedEntityType: e.entityType });
        }
      }
    }
    const resolved = await this.resolveCatalog(placeHints.map((h) => h.placeId), placeHints);
    for (const r of resolved.values()) {
      unresolvedEntities.push(...r.issues);
    }

    const candidateEntities: SeedCandidate[] = [];
    const experienceCandidates: ExperienceCandidate[] = [];
    const relationOut: InitialPlanSeedResult['relations'] = [];

    for (const pack of packs) {
      for (const rel of pack.relations) {
        if (rel.relationType === 'ALIAS_OF') continue;
        const members = rel.memberPlaceIds
          .map((id) => this.toCanonicalInPack(pack, id))
          .filter((id, i, arr) => id != null && arr.indexOf(id) === i) as number[];
        relationOut.push({
          groupId: rel.groupId,
          relationType: rel.relationType,
          memberCanonicalPlaceIds: members,
          packId: pack.packId,
          notes: rel.notes,
        });
      }

      for (const entity of pack.entities) {
        if (entity.entityType === 'EXPERIENCE_PRODUCT') {
          this.pushExperience(
            entity,
            pack,
            experienceCandidates,
            exclusions,
            input,
            season,
          );
          continue;
        }
        if (entity.entityType === 'CORRIDOR') continue;

        // Alias row — never enter solver pool
        if (entity.canonicalPlaceId != null) {
          exclusions.push({
            placeId: entity.placeId,
            label: entity.label,
            regionId: pack.wizardRegionIds[0],
            reason: 'ALIAS',
            detail: `alias of ${entity.canonicalPlaceId}`,
          });
          continue;
        }

        const placeId = entity.placeId;
        if (placeId == null) continue;

        if (excludeSet.has(placeId)) {
          exclusions.push({
            placeId,
            label: entity.label,
            regionId: pack.wizardRegionIds[0],
            reason: 'USER_EXCLUDED',
          });
          continue;
        }

        // Highlands / F-road vehicle gate
        const vehicleGate = this.evalVehicleGate(entity, input.vehicleProfile, pack);
        if (vehicleGate.status === 'BLOCK') {
          exclusions.push({
            placeId,
            label: entity.label,
            regionId: pack.wizardRegionIds[0],
            reason:
              pack.planningPolicy.involvesFRoad || pack.packId === 'highlands'
                ? 'HIGHLANDS_GATE'
                : 'VEHICLE_INCOMPATIBLE',
            detail: vehicleGate.codes.join(','),
          });
          continue;
        }

        const seasonGate = this.evalSeasonGate(entity, season);
        if (seasonGate.status === 'BLOCK' && !mustInclude.has(placeId)) {
          exclusions.push({
            placeId,
            label: entity.label,
            regionId: pack.wizardRegionIds[0],
            reason: 'SEASONALLY_UNAVAILABLE',
            detail: season,
          });
          continue;
        }

        const catalog = resolved.get(placeId);
        if (catalog && !catalog.ok) {
          exclusions.push({
            placeId,
            label: entity.label,
            regionId: pack.wizardRegionIds[0],
            reason: 'CATALOG_UNRESOLVED',
          });
          continue;
        }

        // CORRIDOR_ONLY packs: allow hubs/services, not attraction coverage
        const isAttraction =
          entity.entityType === 'ATTRACTION' || entity.entityType === 'ATTRACTION_AREA';
        if (pack.coverageStatus === 'CORRIDOR_ONLY' && isAttraction) {
          exclusions.push({
            placeId,
            label: entity.label,
            regionId: pack.wizardRegionIds[0],
            reason: 'CORRIDOR_ONLY_NO_ATTRACTION',
          });
          continue;
        }

        // Parent-child: child blocked if parent excluded/unavailable later — soft check
        if (entity.parentPlaceId != null) {
          const parentCanon = this.toCanonicalInPack(pack, entity.parentPlaceId);
          if (parentCanon != null && excludeSet.has(parentCanon)) {
            exclusions.push({
              placeId,
              label: entity.label,
              regionId: pack.wizardRegionIds[0],
              reason: 'PARENT_UNAVAILABLE',
              detail: `parent ${parentCanon} excluded`,
            });
            continue;
          }
        }

        const { score, breakdown, selectedBecause } = this.scoreEntity({
          entity,
          pack,
          mustInclude: mustInclude.has(placeId),
          seasonGate,
          vehicleGate,
        });

        if (score < 0 && !mustInclude.has(placeId)) {
          exclusions.push({
            placeId,
            label: entity.label,
            regionId: pack.wizardRegionIds[0],
            reason: 'LOW_SCORE',
            detail: String(score),
          });
          continue;
        }

        const countsTowardAttractionCoverage =
          isAttraction &&
          pack.coverageStatus !== 'CORRIDOR_ONLY' &&
          (entity.coverageRole === 'PRIMARY' || entity.coverageRole === 'SECONDARY') &&
          entity.parentPlaceId == null; // child does not double-count coverage

        const subregionId = this.findSubregion(pack, placeId);
        const relationGroupIds = pack.relations
          .filter(
            (r) =>
              r.relationType !== 'ALIAS_OF' &&
              r.memberPlaceIds.some((m) => this.toCanonicalInPack(pack, m) === placeId),
          )
          .map((r) => r.groupId);

        const gateOutcome: GateOutcome = {
          status:
            vehicleGate.status === 'WARN' || seasonGate.status === 'WARN'
              ? 'WARN'
              : 'PASS',
          codes: [...vehicleGate.codes, ...seasonGate.codes],
        };

        candidateEntities.push({
          candidateId: `gs:${pack.packId}:${placeId}`,
          canonicalPlaceId: placeId,
          label: catalog?.nameEN || catalog?.nameCN || entity.displayName || entity.label,
          entityType: entity.entityType,
          kind: this.toKind(entity.entityType),
          regionId: pack.wizardRegionIds[0] ?? pack.packId,
          packId: pack.packId,
          subregionId,
          coverageRole: entity.coverageRole,
          countsTowardAttractionCoverage,
          score,
          scoreBreakdown: breakdown,
          relationGroupIds,
          parentCanonicalPlaceId:
            entity.parentPlaceId != null
              ? this.toCanonicalInPack(pack, entity.parentPlaceId) ?? undefined
              : undefined,
          selectedBecause,
          gateOutcome,
        });
      }
    }

    // Deduplicate by canonicalPlaceId (keep highest score)
    const deduped = this.dedupeByPlace(candidateEntities);

    const dayScopeRules = this.buildDayScope(packs, deduped);

    evidence.push({
      type: 'SEED_SUMMARY',
      message: `seeded ${deduped.length} candidates, ${experienceCandidates.length} experiences, ${exclusions.length} exclusions`,
      meta: { dayCount, season },
    });

    this.logger.log(
      `InitialPlanSeed trip=${input.tripId} candidates=${deduped.length} exp=${experienceCandidates.length}`,
    );

    return {
      selectedRegions,
      candidateEntities: deduped,
      experienceCandidates,
      unresolvedEntities,
      exclusions,
      evidence,
      catalogGaps,
      confirmedLodgings: input.confirmedLodgings?.filter(
        (l) => typeof l.placeId === 'number' && l.placeId > 0,
      ),
      originGateway: input.originGateway,
      exitGateway: input.exitGateway,
      relations: relationOut,
      dayScopeRules,
    };
  }

  private selectPacks(
    regionIds: string[],
    dayCount: number,
    evidence: SeedEvidence[],
    exclusions: SeedExclusion[],
  ): IcelandRegionPlanningPack[] {
    const selected: IcelandRegionPlanningPack[] = [];
    const seen = new Set<string>();
    const push = (p: IcelandRegionPlanningPack | null | undefined) => {
      if (!p || seen.has(p.packId)) return;
      seen.add(p.packId);
      selected.push(p);
    };

    // Soft-include arrival
    push(getRegionPack('reykjavik_arrival'));

    for (const rid of regionIds) {
      if (rid === 'ring_road') {
        push(getRegionPack('ring_road'));
        continue;
      }
      for (const p of packsForWizardRegion(rid)) push(p);
    }

    // Day capacity: drop costly packs when tight (prefer coastal west over east, drop highlands first)
    const ordered = [...selected].sort((a, b) => {
      if (a.packId === 'reykjavik_arrival') return -1;
      if (b.packId === 'reykjavik_arrival') return 1;
      if (a.packId === 'highlands') return 1;
      if (b.packId === 'highlands') return -1;
      return (a.planningPolicy.minRecommendedDays ?? 1) - (b.planningPolicy.minRecommendedDays ?? 1);
    });
    const kept: IcelandRegionPlanningPack[] = [];
    let used = 0;
    for (const pack of ordered) {
      if (pack.packId === 'ring_road') {
        kept.push(pack);
        continue;
      }
      const cost = pack.planningPolicy.minRecommendedDays ?? 1;
      if (used + cost <= dayCount + 0.01 || kept.filter((k) => k.packId !== 'reykjavik_arrival').length === 0) {
        kept.push(pack);
        used += cost;
      } else {
        evidence.push({
          type: 'PACK_DROPPED_CAPACITY',
          packId: pack.packId,
          message: `天数不足，暂缓包 ${pack.packId}`,
        });
        for (const rid of pack.wizardRegionIds) {
          exclusions.push({
            regionId: rid,
            reason: 'INSUFFICIENT_DAYS',
            detail: pack.packId,
          });
        }
      }
    }
    return kept;
  }

  private async resolveCatalog(
    placeIds: number[],
    hints: Array<{ placeId: number; expectedEntityType?: IcelandRegionEntityRef['entityType'] }>,
  ): Promise<Map<number, ResolvedCatalogPlace>> {
    if (!this.catalogResolver) {
      // Offline / unit tests without Prisma: treat as ok
      const map = new Map<number, ResolvedCatalogPlace>();
      for (const id of placeIds) {
        map.set(id, {
          placeId: id,
          nameCN: '',
          nameEN: null,
          category: null,
          lat: 0,
          lng: 0,
          ok: true,
          issues: [],
        });
      }
      return map;
    }
    return this.catalogResolver.resolvePlaceIds(placeIds, hints);
  }

  private pushExperience(
    entity: IcelandRegionEntityRef,
    pack: IcelandRegionPlanningPack,
    out: ExperienceCandidate[],
    exclusions: SeedExclusion[],
    input: InitialPlanSeedInput,
    season: string,
  ) {
    const id = entity.experienceProductId;
    if (!id) return;
    if (entity.placeId != null) {
      exclusions.push({
        experienceProductId: id,
        reason: 'CATALOG_UNRESOLVED',
        detail: 'EXPERIENCE_REUSED_PLACE_ID',
      });
      return;
    }
    const seasonOk =
      !entity.seasonalAvailability?.length ||
      entity.seasonalAvailability.includes('all') ||
      entity.seasonalAvailability.includes(season);
    if (!seasonOk) {
      exclusions.push({
        experienceProductId: id,
        label: entity.label,
        regionId: pack.wizardRegionIds[0],
        reason: 'SEASONALLY_UNAVAILABLE',
      });
      return;
    }
    if (pack.packId === 'highlands' && input.vehicleProfile?.allowsFRoad === false) {
      // still discoverable as tour product
    }
    out.push({
      experienceProductId: id,
      label: entity.label,
      regionId: pack.wizardRegionIds[0] ?? pack.packId,
      packId: pack.packId,
      meetingPlaceId: entity.meetingPlaceId,
      regionAnchorPlaceId: entity.regionAnchorPlaceId,
      bookingRequired: entity.bookingRequired !== false,
      durationMinutes: entity.durationMinutes,
      status: 'NEEDS_BOOKING_VERIFICATION',
      selectedBecause: ['golden_set_experience', 'not_confirmed_activity'],
      gateOutcome: {
        status: 'WARN',
        codes: ['NEEDS_BOOKING_VERIFICATION'],
        notes: ['Must not write as BOOKED until inventory/confirm'],
      },
    });
  }

  private evalVehicleGate(
    entity: IcelandRegionEntityRef,
    vehicle: InitialPlanSeedInput['vehicleProfile'],
    pack: IcelandRegionPlanningPack,
  ): GateOutcome {
    const codes: string[] = [];
    const warnCodes: string[] = [];
    const constraints = entity.vehicleConstraints ?? [];
    if (constraints.includes('4wd_required') && vehicle?.is4wd === false) {
      codes.push('4WD_REQUIRED');
    }
    if (constraints.includes('f_road') && vehicle?.allowsFRoad === false) {
      codes.push('F_ROAD_BLOCKED');
    }
    // Explicit reject only — unset allowsRiverCrossing does not block at create
    if (constraints.includes('river_crossing') && vehicle?.allowsRiverCrossing === false) {
      codes.push('RIVER_CROSSING_BLOCKED');
    }
    // Highlands: BLOCK only when user explicitly rejects 4WD / F-road.
    // Empty / incomplete vehicle at create → WARN and still seed candidates.
    const isHighlandAttraction =
      pack.packId === 'highlands' &&
      (entity.entityType === 'ATTRACTION' || entity.entityType === 'ATTRACTION_AREA');
    if (isHighlandAttraction) {
      const explicitNo4wd = vehicle?.is4wd === false;
      const explicitNoFroad = vehicle?.allowsFRoad === false;
      if (
        (explicitNo4wd || explicitNoFroad) &&
        vehicle?.is4wd !== true &&
        vehicle?.allowsFRoad !== true
      ) {
        codes.push('HIGHLANDS_NO_4WD_EVIDENCE');
      } else if (
        !vehicle ||
        (vehicle.is4wd !== true && vehicle.allowsFRoad !== true)
      ) {
        warnCodes.push('HIGHLANDS_VEHICLE_UNCONFIRMED');
      }
    }
    if (codes.length) {
      return { status: 'BLOCK', codes };
    }
    if (warnCodes.length) {
      return { status: 'WARN', codes: warnCodes };
    }
    if (constraints.length && !vehicle) {
      return { status: 'WARN', codes: ['VEHICLE_PROFILE_UNKNOWN'] };
    }
    return { status: 'PASS', codes: [] };
  }

  private evalSeasonGate(entity: IcelandRegionEntityRef, season: string): GateOutcome {
    const avail = entity.seasonalAvailability;
    if (!avail?.length || avail.includes('all')) return { status: 'PASS', codes: [] };
    if (avail.includes(season)) return { status: 'PASS', codes: [] };
    return { status: 'BLOCK', codes: ['SEASON_MISMATCH'] };
  }

  private scoreEntity(input: {
    entity: IcelandRegionEntityRef;
    pack: IcelandRegionPlanningPack;
    mustInclude: boolean;
    seasonGate: GateOutcome;
    vehicleGate: GateOutcome;
  }) {
    const breakdown: Record<string, number> = {};
    const role = input.entity.coverageRole;
    breakdown.coveragePriority =
      role === 'PRIMARY' ? 40 : role === 'SECONDARY' ? 20 : 5;
    breakdown.directionFit = 10;
    breakdown.preferenceFit = input.mustInclude ? 30 : 0;
    breakdown.lodgingFit = 10;
    breakdown.seasonalFit = input.seasonGate.status === 'PASS' ? 10 : 0;
    breakdown.routeEfficiency = 10;
    breakdown.riskPenalty = input.vehicleGate.status === 'WARN' ? -5 : 0;
    breakdown.detourPenalty = 0;
    breakdown.fatiguePenalty = 0;
    if (input.mustInclude) breakdown.coveragePriority += 20;

    const score = Object.values(breakdown).reduce((a, b) => a + b, 0);
    const selectedBecause = [
      'golden_set',
      role ? `coverage_${role}` : 'support',
      ...(input.mustInclude ? ['user_request'] : []),
    ];
    return { score, breakdown, selectedBecause };
  }

  private toCanonicalInPack(pack: IcelandRegionPlanningPack, placeId: number): number | null {
    const ent = pack.entities.find((e) => e.placeId === placeId);
    if (!ent) return placeId;
    if (ent.canonicalPlaceId != null) return ent.canonicalPlaceId;
    return ent.placeId ?? null;
  }

  private findSubregion(pack: IcelandRegionPlanningPack, placeId: number): string | undefined {
    return pack.subregions?.find((s) => s.entityPlaceIds.includes(placeId))?.subregionId;
  }

  private toKind(t: IcelandRegionEntityRef['entityType']): SeedCandidate['kind'] {
    if (t === 'ATTRACTION' || t === 'ATTRACTION_AREA') return t;
    if (t === 'TOWN_HUB') return 'TOWN_HUB';
    if (t === 'LODGING') return 'LODGING';
    if (t === 'ROUTE_ANCHOR') return 'ROUTE_ANCHOR';
    return 'SERVICE';
  }

  private dedupeByPlace(rows: SeedCandidate[]): SeedCandidate[] {
    const best = new Map<number, SeedCandidate>();
    for (const row of rows) {
      const prev = best.get(row.canonicalPlaceId);
      if (!prev || row.score > prev.score) best.set(row.canonicalPlaceId, row);
    }
    return [...best.values()].sort((a, b) => b.score - a.score);
  }

  private buildDayScope(
    packs: IcelandRegionPlanningPack[],
    candidates: SeedCandidate[],
  ): InitialPlanSeedResult['dayScopeRules'] {
    const requireSubregionDayScopeByPack: Record<string, boolean> = {};
    const subregions: InitialPlanSeedResult['dayScopeRules']['subregions'] = [];
    for (const pack of packs) {
      requireSubregionDayScopeByPack[pack.packId] = Boolean(
        pack.planningPolicy.requireSubregionDayScope,
      );
      for (const s of pack.subregions ?? []) {
        const members = s.entityPlaceIds.filter((id) =>
          candidates.some((c) => c.canonicalPlaceId === id),
        );
        subregions.push({
          packId: pack.packId,
          subregionId: s.subregionId,
          displayName: s.displayName,
          memberCanonicalPlaceIds: members,
        });
      }
    }
    return {
      requireSubregionDayScopeByPack,
      subregions,
      policy: {
        oneHighSpanSubregionPerNaturalDay: true,
        crossSubregionRequiresExplicitTransferDay: true,
        highlandsRequiresExplicitBranch: true,
        doNotCollapseSameRegionIntoSameDay: true,
      },
    };
  }

  private countDays(startDate: string, endDate: string): number {
    const start = DateTime.fromISO(startDate, { zone: 'utc' }).startOf('day');
    const end = DateTime.fromISO(endDate, { zone: 'utc' }).startOf('day');
    if (!start.isValid || !end.isValid) return 1;
    return Math.max(1, Math.floor(end.diff(start, 'days').days) + 1);
  }

  private inferSeason(startDate: string): string {
    const m = DateTime.fromISO(startDate, { zone: 'utc' }).month;
    if (m >= 6 && m <= 8) return 'summer';
    if (m === 5 || m === 9) return 'shoulder';
    return 'winter';
  }
}
