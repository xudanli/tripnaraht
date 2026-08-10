import { Injectable } from '@nestjs/common';
import {
  buildGoldenSetInventory,
  getRegionPack,
  listActiveRegionPacks,
  listCoverageAttractionEntities,
  listSolverAttractionPlaceIds,
  packsForWizardRegion,
  softAlternativeGroups,
} from '../packs/iceland-region-pack.registry';
import type { IcelandRegionPlanningPack } from '../types/iceland-region-planning-pack.types';

@Injectable()
export class IcelandRegionPlanningPackService {
  listPacks(): IcelandRegionPlanningPack[] {
    return listActiveRegionPacks();
  }

  getPack(packId: string): IcelandRegionPlanningPack | null {
    return getRegionPack(packId);
  }

  packsForWizardRegion(regionId: string): IcelandRegionPlanningPack[] {
    return packsForWizardRegion(regionId);
  }

  /** QA inventory for product核对 */
  getGoldenSetInventory() {
    return {
      version: '2026-07-qa1',
      items: buildGoldenSetInventory(),
      packs: listActiveRegionPacks().map((p) => ({
        packId: p.packId,
        wizardRegionIds: p.wizardRegionIds,
        coverageStatus: p.coverageStatus,
        regionalGoldenSetReady: p.regionalGoldenSetReady,
        subregionIds: p.subregions?.map((s) => s.subregionId) ?? [],
        softAlternativeGroups: softAlternativeGroups(p),
        solverAttractionPlaceIds: listSolverAttractionPlaceIds(p),
        coverageAttractionCount: listCoverageAttractionEntities(p).length,
        experienceProductIds: p.entities
          .filter((e) => e.entityType === 'EXPERIENCE_PRODUCT')
          .map((e) => e.experienceProductId)
          .filter(Boolean),
      })),
    };
  }
}
