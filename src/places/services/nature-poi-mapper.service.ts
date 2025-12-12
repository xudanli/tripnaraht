// src/places/services/nature-poi-mapper.service.ts
import { Injectable } from '@nestjs/common';
import {
  IcelandNaturePoi,
  TimeSlotActivity,
  MapOptions,
  IcelandNatureSubCategory,
} from '../interfaces/nature-poi.interface';
import { NaraHintService } from './nara-hint.service';

/**
 * 自然 POI 到活动映射服务
 * 
 * 功能：
 * 1. 将自然 POI 映射为 TimeSlotActivity
 * 2. 根据子类别自动生成活动类型、时长、标签等
 * 3. 生成默认的备注和安全提示
 */
@Injectable()
export class NaturePoiMapperService {
  constructor(private naraHintService: NaraHintService) {}

  /**
   * 将自然 POI 映射为活动时间片
   */
  mapNaturePoiToActivitySlot(
    poi: IcelandNaturePoi,
    options: MapOptions = {}
  ): TimeSlotActivity {
    const time = options.time || '09:30';
    const language = options.language || 'zh-CN';

    // 1. 标题：按语言选择展示名
    const nameEn = poi.name.en || poi.name.primary;
    const nameZh = poi.name.zh || poi.name.primary;

    const title = language === 'zh-CN'
      ? (nameZh || nameEn)
      : (nameEn || nameZh);

    // 2. 活动 type 映射（粗粒度）
    const type = this.mapSubCategoryToActivityType(poi.subCategory);

    // 3. 时长：优先用 typicalStay，否则给一个默认
    const durationMinutes =
      poi.typicalStay?.recommendedMinutes
      ?? this.getDefaultDurationBySubCategory(poi.subCategory, options.template);

    // 4. 标签：自然标签 + 摄影/徒步等
    const tags = this.buildActivityTagsFromNaturePoi(poi);

    // 生成 NARA 提示
    const naraHint = this.naraHintService.generateNaraHint(poi);

    return {
      time,
      title,
      activity: title,
      type,
      durationMinutes,
      coordinates: poi.coordinates,
      notes: this.buildDefaultNotesFromNaturePoi(poi),
      details: {
        name: {
          chinese: nameZh,
          english: nameEn,
          local: poi.name.local,
        },
        coordinates: poi.coordinates,
        poiRef: {
          source: poi.externalSource,
          externalId: poi.externalId,
          subCategory: poi.subCategory,
          confidence: 0.95,
        },
        tags,
        naraHint, // ✅ 添加 NARA 提示
      },
    };
  }

  /**
   * 将子类别映射为活动类型
   */
  private mapSubCategoryToActivityType(
    sub: IcelandNatureSubCategory
  ): string {
    switch (sub) {
      case 'volcano':
      case 'lava_field':
      case 'geothermal_area':
      case 'glacier':
      case 'glacier_lagoon':
      case 'waterfall':
      case 'canyon':
      case 'crater_lake':
        return 'nature';         // 自然观光

      case 'black_sand_beach':
      case 'sea_cliff':
      case 'coastline':
        return 'coastal';

      case 'national_park':
      case 'nature_reserve':
        return 'nature_park';

      case 'viewpoint':
        return 'viewpoint';

      case 'cave':
        return 'explore';

      default:
        return 'nature';
    }
  }

  /**
   * 根据子类别和模板获取默认时长
   */
  private getDefaultDurationBySubCategory(
    sub: IcelandNatureSubCategory,
    template?: MapOptions['template'],
  ): number {
    if (template === 'photoStop') return 30;
    if (template === 'shortWalk') return 60;
    if (template === 'halfDayHike') return 180;

    switch (sub) {
      case 'waterfall':
      case 'viewpoint':
      case 'black_sand_beach':
        return 45;

      case 'glacier_lagoon':
      case 'national_park':
        return 120;

      case 'glacier':
      case 'canyon':
      case 'cave':
        return 180;

      case 'volcano':
      case 'lava_field':
        return 90;

      case 'geothermal_area':
      case 'hot_spring':
        return 60;

      default:
        return 60;
    }
  }

  /**
   * 从自然 POI 构建活动标签
   */
  private buildActivityTagsFromNaturePoi(poi: IcelandNaturePoi): string[] {
    const tags = new Set<string>(poi.tags || []);

    tags.add('nature');

    // 根据子类别添加特定标签
    if (poi.subCategory === 'waterfall') {
      tags.add('photography');
      tags.add('water');
    }

    if (poi.subCategory === 'glacier' || poi.subCategory === 'glacier_lagoon') {
      tags.add('ice');
      tags.add('unique-landscape');
    }

    if (poi.subCategory === 'lava_field' || poi.subCategory === 'geothermal_area') {
      tags.add('geology');
      tags.add('unique-landscape');
    }

    if (poi.subCategory === 'volcano') {
      tags.add('geology');
      tags.add('extreme');
    }

    if (poi.subCategory === 'black_sand_beach') {
      tags.add('photography');
      tags.add('coastal');
    }

    if (poi.subCategory === 'canyon') {
      tags.add('hiking');
      tags.add('adventure');
    }

    // 根据访问方式添加标签
    if (poi.accessType === 'hike') {
      tags.add('hiking');
    }

    if (poi.accessType === '4x4') {
      tags.add('adventure');
      tags.add('off-road');
    }

    if (poi.requiresGuide) {
      tags.add('guided');
    }

    // 根据难度添加标签
    if (poi.trailDifficulty === 'hard' || poi.trailDifficulty === 'expert') {
      tags.add('challenging');
    }

    if (poi.trailDifficulty === 'easy') {
      tags.add('family-friendly');
    }

    return Array.from(tags);
  }

  /**
   * 从自然 POI 构建默认备注
   */
  private buildDefaultNotesFromNaturePoi(poi: IcelandNaturePoi): string {
    const parts: string[] = [];

    // 根据子类别添加特定提示
    if (poi.subCategory === 'waterfall') {
      parts.push('可准备防水外套，靠近瀑布区域水汽较大。');
    }

    if (poi.subCategory === 'lava_field') {
      parts.push('地表可能不平整，建议穿防滑登山鞋，避免踩在松动岩块上。');
    }

    if (poi.subCategory === 'glacier' || poi.subCategory === 'glacier_lagoon') {
      parts.push('注意保暖，冰川区域温度较低，建议穿着防滑鞋。');
    }

    if (poi.subCategory === 'geothermal_area' || poi.subCategory === 'hot_spring') {
      parts.push('地热区域地面可能较薄，请按指定路线行走，注意安全。');
    }

    if (poi.subCategory === 'volcano') {
      parts.push('火山区域请遵守安全规定，不要进入危险区域。');
      if (poi.isActiveVolcano) {
        parts.push('这是活火山，请关注官方安全提示。');
      }
    }

    if (poi.subCategory === 'black_sand_beach') {
      parts.push('黑沙滩海浪可能较大，请保持安全距离，注意海浪。');
    }

    // 安全相关提示
    if (poi.hazardLevel === 'high' || poi.hazardLevel === 'extreme') {
      parts.push('⚠️ 注意安全提示，有危险区域请勿擅自进入。');
    }

    if (poi.requiresGuide) {
      parts.push('此区域建议通过正规旅行团或向导带领前往。');
    }

    // 访问方式提示
    if (poi.accessType === '4x4') {
      parts.push('需要四驱车才能到达，普通车辆可能无法通行。');
    }

    if (poi.accessType === 'hike') {
      const difficulty = poi.trailDifficulty || 'unknown';
      if (difficulty === 'hard' || difficulty === 'expert') {
        parts.push('徒步路线较难，需要一定体力和经验。');
      }
    }

    // 季节提示
    if (poi.bestSeasons && poi.bestSeasons.length > 0) {
      const seasonNames: Record<string, string> = {
        spring: '春季',
        summer: '夏季',
        autumn: '秋季',
        winter: '冬季',
      };
      const seasonText = poi.bestSeasons.map(s => seasonNames[s]).join('、');
      parts.push(`最佳访问季节：${seasonText}。`);
    }

    // 添加安全提示
    if (poi.safetyNotes && poi.safetyNotes.length > 0) {
      parts.push(...poi.safetyNotes);
    }

    return parts.join(' ');
  }

  /**
   * 批量映射多个 POI
   */
  mapMultiplePoisToActivities(
    pois: IcelandNaturePoi[],
    options: MapOptions = {}
  ): TimeSlotActivity[] {
    return pois.map(poi => this.mapNaturePoiToActivitySlot(poi, options));
  }
}
