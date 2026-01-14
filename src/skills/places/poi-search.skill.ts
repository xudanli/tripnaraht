// src/skills/places/poi-search.skill.ts
/**
 * poi.search Skill
 * 
 * 搜索 POI（地点）
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { PlacesService } from '../../places/places.service';
import { EntityResolutionService } from '../../places/services/entity-resolution.service';
import { Skill as SkillDecorator } from '../decorators/skill.decorator';

export interface PoiSearchInput extends SkillInput {
  query: string;
  limit?: number;
  lat?: number;
  lng?: number;
}

export interface PoiSearchOutput extends SkillOutput {
  pois: Array<{
    poi_id: string;
    name: string;
    nameCN?: string;
    nameEN?: string;
    coordinates?: { lat: number; lng: number };
    category?: string;
    address?: string;
    evidence_id: string;
  }>;
}

@SkillDecorator({
  name: 'poi.search',
  description: '搜索 POI（地点）',
  version: '1.0.0',
  category: 'trip',
  toolGroup: 'DOMAIN',
})
@Injectable()
export class PoiSearchSkill implements Skill<PoiSearchInput, PoiSearchOutput> {
  private readonly logger = new Logger(PoiSearchSkill.name);

  metadata = {
    name: 'poi.search',
    description: '搜索 POI（地点）',
    version: '1.0.0',
    category: 'trip' as const,
    toolGroup: 'DOMAIN' as const,
    inputSchema: {
      required: ['query'],
    },
  };

  constructor(
    @Optional() private readonly placesService?: PlacesService,
    @Optional() private readonly entityResolutionService?: EntityResolutionService,
  ) {
    this.logger.log(`[PoiSearchSkill] 已初始化`);
  }

  async execute(input: PoiSearchInput): Promise<PoiSearchOutput> {
    this.logger.debug(`执行 poi.search: query=${input.query}, limit=${input.limit || 10}`);

    try {
      const limit = input.limit || 10;
      let pois: Array<{
        poi_id: string;
        name: string;
        nameCN?: string;
        nameEN?: string;
        coordinates?: { lat: number; lng: number };
        category?: string;
        address?: string;
        evidence_id: string;
      }> = [];

      // 优先使用 EntityResolutionService（如果可用）
      if (this.entityResolutionService) {
        try {
          const resolutionResult = await this.entityResolutionService.resolveEntities(
            input.query,
            [], // mustHavePois
            input.lat,
            input.lng,
            limit,
          );

          pois = resolutionResult.results
            .filter(r => r.lat != null && r.lng != null && r.lat !== 0 && r.lng !== 0)
            .map(r => ({
              poi_id: String(r.id),
              name: r.nameCN || r.nameEN || r.name,
              nameCN: r.nameCN,
              nameEN: r.nameEN,
              coordinates: { lat: r.lat!, lng: r.lng! },
              category: r.category,
              address: r.address,
              evidence_id: `poi_${r.id}_${Date.now()}`,
            }));
        } catch (error: any) {
          this.logger.warn(`EntityResolutionService 失败: ${error?.message}，尝试使用 PlacesService`);
        }
      }

      // 如果 EntityResolutionService 不可用或失败，使用 PlacesService
      if (pois.length === 0 && this.placesService) {
        try {
          const searchResults = await this.placesService.search(
            input.query,
            input.lat,
            input.lng,
            undefined,
            undefined,
            limit
          );

          pois = searchResults.map((place: any, index: number) => ({
            poi_id: String(place.id || place.place_id || `poi_${index}`),
            name: place.name || place.nameCN || place.nameEN || '未知地点',
            nameCN: place.nameCN,
            nameEN: place.nameEN,
            coordinates: place.geo || (place.lat && place.lng ? { lat: place.lat, lng: place.lng } : undefined),
            category: place.category,
            address: place.address,
            evidence_id: `poi_${place.id || place.place_id || index}_${Date.now()}`,
          }));
        } catch (error: any) {
          this.logger.error(`PlacesService 搜索失败: ${error?.message}`);
        }
      }

      return {
        pois,
      };
    } catch (error: any) {
      this.logger.error(`poi.search 失败: ${error?.message}`, error?.stack);
      throw error;
    }
  }
}
