/**
 * Helpers over Region Planning Packs — canonical resolution, coverage entities, inventory.
 */

import type {
  IcelandRegionEntityRef,
  IcelandRegionPlanningPack,
} from '../types/iceland-region-planning-pack.types';
import {
  ICELAND_REGION_PLANNING_PACK_BY_ID,
  ICELAND_REGION_PLANNING_PACKS,
} from './iceland-region-planning-packs';

export function listActiveRegionPacks(): IcelandRegionPlanningPack[] {
  return ICELAND_REGION_PLANNING_PACKS.filter((p) => p.status === 'ACTIVE');
}

export function getRegionPack(packId: string): IcelandRegionPlanningPack | null {
  return ICELAND_REGION_PLANNING_PACK_BY_ID[packId] ?? null;
}

export function packsForWizardRegion(regionId: string): IcelandRegionPlanningPack[] {
  const id = regionId.trim();
  if (id === 'south_coast') {
    return [
      getRegionPack('south_coast_west'),
      getRegionPack('south_coast_east'),
    ].filter((p): p is IcelandRegionPlanningPack => Boolean(p));
  }
  return listActiveRegionPacks().filter((p) => p.wizardRegionIds.includes(id));
}

/** Resolve alias → canonical placeId; drops EXPERIENCE_PRODUCT and pure aliases from coverage. */
export function resolveCanonicalPlaceId(
  entity: IcelandRegionEntityRef,
): number | null {
  if (entity.entityType === 'EXPERIENCE_PRODUCT') return null;
  if (entity.entityType === 'CORRIDOR') return null;
  if (entity.canonicalPlaceId != null) return null; // alias row — skip
  if (typeof entity.placeId === 'number' && entity.placeId > 0) return entity.placeId;
  return null;
}

/** Attraction / area entities that count toward regional golden-set coverage. */
export function listCoverageAttractionEntities(
  pack: IcelandRegionPlanningPack,
): IcelandRegionEntityRef[] {
  if (pack.coverageStatus === 'CORRIDOR_ONLY') return [];
  return pack.entities.filter((e) => {
    if (e.canonicalPlaceId != null) return false;
    if (e.entityType === 'EXPERIENCE_PRODUCT' || e.entityType === 'CORRIDOR') {
      return false;
    }
    if (e.entityType === 'TOWN_HUB' || e.entityType === 'LODGING' || e.entityType === 'SERVICE') {
      return e.coverageRole === 'PRIMARY' || e.coverageRole === 'SECONDARY';
    }
    if (e.parentPlaceId != null && e.coverageRole === 'SECONDARY') {
      // Child attractions: include for listing but coverage scoring should prefer parent
      return true;
    }
    return (
      e.coverageRole === 'PRIMARY' ||
      e.coverageRole === 'SECONDARY'
    );
  });
}

/** PlaceIds that should enter seed/solver (canonical attractions + areas only). */
export function listSolverAttractionPlaceIds(pack: IcelandRegionPlanningPack): number[] {
  const ids = new Set<number>();
  for (const e of pack.entities) {
    if (e.canonicalPlaceId != null) continue;
    if (e.entityType !== 'ATTRACTION' && e.entityType !== 'ATTRACTION_AREA') continue;
    if (e.coverageRole !== 'PRIMARY' && e.coverageRole !== 'SECONDARY') continue;
    // Prefer parent for coverage seed; still allow child SECONDARY for optional hike
    if (typeof e.placeId === 'number') ids.add(e.placeId);
  }
  return [...ids];
}

export interface GoldenSetInventoryRow {
  packId: string;
  wizardRegionIds: string[];
  coverageStatus: string;
  regionalGoldenSetReady: boolean;
  placeId?: number;
  experienceProductId?: string;
  label: string;
  entityType: string;
  coverageRole?: string;
  routeRoles?: string[];
  canonicalPlaceId?: number;
  parentPlaceId?: string | number;
  notes?: string;
}

export function buildGoldenSetInventory(
  packs: IcelandRegionPlanningPack[] = ICELAND_REGION_PLANNING_PACKS,
): GoldenSetInventoryRow[] {
  const rows: GoldenSetInventoryRow[] = [];
  for (const pack of packs) {
    for (const e of pack.entities) {
      rows.push({
        packId: pack.packId,
        wizardRegionIds: pack.wizardRegionIds,
        coverageStatus: pack.coverageStatus,
        regionalGoldenSetReady: pack.regionalGoldenSetReady,
        placeId: e.placeId,
        experienceProductId: e.experienceProductId,
        label: e.displayName ?? e.label,
        entityType: e.entityType,
        coverageRole: e.coverageRole,
        routeRoles: e.routeRoles,
        canonicalPlaceId: e.canonicalPlaceId,
        parentPlaceId: e.parentPlaceId,
        notes: e.notes,
      });
    }
  }
  return rows;
}

export function softAlternativeGroups(pack: IcelandRegionPlanningPack): string[] {
  return pack.relations
    .filter((r) => r.relationType === 'SOFT_ALTERNATIVE')
    .map((r) => r.groupId);
}
