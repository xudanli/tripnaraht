// src/skills/places/opening-hours-get.skill.ts
/**
 * opening_hours.get Skill
 * 
 * 获取 POI 的开放时间
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { PlacesService } from '../../places/places.service';
import { Skill as SkillDecorator } from '../decorators/skill.decorator';
import {
  extractOpeningHoursFromPlaceMetadata,
  hasResolvableOpeningHours,
  openingHoursToEvidenceString,
} from '../../common/utils/resolve-place-opening-hours.util';

export interface OpeningHoursGetInput extends SkillInput {
  poi_ids: string[];
}

export interface OpeningHoursGetOutput extends SkillOutput {
  opening_hours: Array<{
    poi_id: string;
    opening_hours?: any;
    is_open_now?: boolean;
    evidence_id: string;
  }>;
}

@SkillDecorator({
  name: 'opening_hours.get',
  description: '获取 POI opening_hours 与时区规则。在 RESEARCH/VERIFY 阶段校验活动时间窗或 repair 需判断营业冲突时调用。',
  version: '1.0.0',
  category: 'trip',
  toolGroup: 'DOMAIN',
})
@Injectable()
export class OpeningHoursGetSkill implements Skill<OpeningHoursGetInput, OpeningHoursGetOutput> {
  private readonly logger = new Logger(OpeningHoursGetSkill.name);

  metadata = {
    name: 'opening_hours.get',
    description: '获取 POI opening_hours 与时区规则。在 RESEARCH/VERIFY 阶段校验活动时间窗或 repair 需判断营业冲突时调用。',
    version: '1.0.0',
    category: 'trip' as const,
    toolGroup: 'DOMAIN' as const,
    inputSchema: {
      required: ['poi_ids'],
    },
  };

  constructor(
    @Optional() private readonly placesService?: PlacesService,
  ) {
    this.logger.log(`[OpeningHoursGetSkill] 已初始化`);
  }

  async execute(input: OpeningHoursGetInput): Promise<OpeningHoursGetOutput> {
    this.logger.debug(`执行 opening_hours.get: poi_ids=${input.poi_ids.join(', ')}`);

    try {
      if (!this.placesService) {
        throw new Error('PlacesService 未注入');
      }

      // 并行获取所有 POI 的详情
      const placesService = this.placesService!; // 已在上方检查，使用非空断言
      const results = await Promise.allSettled(
        input.poi_ids.map(async (poiId) => {
          try {
            // 尝试获取地点详细信息（包含开放时间）
            const placeIdNum = parseInt(poiId, 10);
            let openingHours: any = null;
            let isOpenNow = false;
            
            if (!isNaN(placeIdNum)) {
              try {
                // 先尝试从数据库获取
                const place = await placesService.findOne(placeIdNum);
                if (place) {
                  const metadata = (place.metadata as any) || {};
                  openingHours = extractOpeningHoursFromPlaceMetadata(metadata);
                  // place.status 包含 isOpen 字段
                  isOpenNow = place.status?.isOpen ?? false;
                } else {
                  // 如果不存在，尝试通过 enrichPlaceFromAmap 获取并创建
                  try {
                    await placesService.enrichPlaceFromAmap(placeIdNum);
                    const updatedPlace = await placesService.findOne(placeIdNum);
                    if (updatedPlace) {
                      const metadata = (updatedPlace.metadata as any) || {};
                      openingHours = extractOpeningHoursFromPlaceMetadata(metadata);
                      // place.status 包含 isOpen 字段
                      isOpenNow = updatedPlace.status?.isOpen ?? false;
                    }
                  } catch (enrichError: any) {
                    this.logger.warn(`无法通过 enrichPlaceFromAmap 获取地点 ${poiId} 的详细信息: ${enrichError?.message}`);
                  }
                }
              } catch (error: any) {
                this.logger.warn(`无法获取地点 ${poiId} 的详细信息: ${error?.message}`);
              }
            }
            
            const evidenceHours = hasResolvableOpeningHours(openingHours)
              ? openingHoursToEvidenceString(openingHours) ?? openingHours
              : openingHours;

            return {
              poi_id: poiId,
              opening_hours: evidenceHours,
              is_open_now: isOpenNow,
              evidence_id: `opening_hours_${poiId}_${Date.now()}`,
            };
          } catch (error: any) {
            this.logger.warn(`获取 POI ${poiId} 的开放时间失败: ${error?.message}`);
            return {
              poi_id: poiId,
              opening_hours: undefined,
              is_open_now: undefined,
              evidence_id: `opening_hours_${poiId}_error`,
            };
          }
        })
      );

      const opening_hours = results.map((result, index) => {
        if (result.status === 'fulfilled') {
          return result.value;
        } else {
          return {
            poi_id: input.poi_ids[index],
            opening_hours: undefined,
            is_open_now: undefined,
            evidence_id: `opening_hours_${input.poi_ids[index]}_error`,
          };
        }
      });

      return {
        opening_hours,
      };
    } catch (error: any) {
      this.logger.error(`opening_hours.get 失败: ${error?.message}`, error?.stack);
      throw error;
    }
  }
}
