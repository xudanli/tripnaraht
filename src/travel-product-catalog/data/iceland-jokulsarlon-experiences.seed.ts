/**
 * 杰古沙龙冰河湖 — 规划层体验项目（无供应商）。
 * Place id 运行时按 nameEN 解析（见 seed 脚本）。
 */

import type { ExperienceDefinition } from '../types/catalog-entities.types';
import {
  TravelProductCategoryCode,
  TravelProductSubtypeCode,
  TravelProductType,
} from '../types/product-taxonomy.types';

type ExperienceDefinitionSeed = Omit<
  ExperienceDefinition,
  'id' | 'createdAt' | 'updatedAt'
>;

export const JOKULSARLON_PLACE_NAME_EN = 'Jökulsárlón Glacier Lagoon';

/** 挂到杰古沙龙的体验 code + 展示顺序 */
export const JOKULSARLON_PLACE_EXPERIENCE_LINKS: readonly {
  experienceCode: string;
  sortOrder: number;
  isFeatured?: boolean;
  label?: string;
  notes?: string;
}[] = [
  {
    experienceCode: 'EXP_JOKULSARLON_AMPHIBIOUS_BOAT',
    sortOrder: 10,
    isFeatured: true,
    label: '水陆两栖船',
  },
  {
    experienceCode: 'EXP_JOKULSARLON_ZODIAC',
    sortOrder: 20,
    isFeatured: true,
    label: 'Zodiac 快艇',
  },
  {
    experienceCode: 'EXP_JOKULSARLON_PRIVATE_SPEEDBOAT',
    sortOrder: 30,
    label: '私人快艇',
  },
  {
    experienceCode: 'EXP_JOKULSARLON_KAYAK',
    sortOrder: 40,
    label: '冰河湖皮划艇',
  },
  {
    experienceCode: 'EXP_JOKULSARLON_PHOTOGRAPHY',
    sortOrder: 50,
    label: '摄影团',
  },
  {
    experienceCode: 'EXP_JOKULSARLON_LAGOON_ICE_CAVE_COMBO',
    sortOrder: 60,
    label: '冰河湖＋冰洞组合',
  },
  {
    experienceCode: 'EXP_JOKULSARLON_LAGOON_GLACIER_HIKE_COMBO',
    sortOrder: 70,
    label: '冰河湖＋冰川徒步组合',
  },
  {
    experienceCode: 'EXP_JOKULSARLON_HELICOPTER',
    sortOrder: 80,
    label: '冰河湖直升机观光',
  },
];

export const JOKULSARLON_EXPERIENCE_DEFINITION_SEEDS: readonly ExperienceDefinitionSeed[] =
  [
    {
      code: 'EXP_JOKULSARLON_AMPHIBIOUS_BOAT',
      productType: TravelProductType.CRUISE_BOAT_TOUR,
      categoryCode: TravelProductCategoryCode.SCENIC_CRUISE,
      subtypeCode: TravelProductSubtypeCode.AMPHIBIOUS_BOAT,
      displayNameZh: '杰古沙龙水陆两栖船',
      displayNameEn: 'Jökulsárlón Amphibious Boat',
      typicalDurationMin: 40,
      fitnessLevel: 'LOW',
      riskLevel: 'LOW',
      weatherDependency: 'MODERATE',
      commonCancelReasons: ['high_wind', 'rough_lagoon'],
      requiresGuide: false,
      relatedExperienceAtomCodes: ['GLACIER_ADVENTURE', 'CINEMATIC_PHOTOGRAPHY'],
      countryCodes: ['IS'],
      metadata: { venueHint: 'Jokulsarlon', planningOnly: true },
    },
    {
      code: 'EXP_JOKULSARLON_ZODIAC',
      productType: TravelProductType.CRUISE_BOAT_TOUR,
      categoryCode: TravelProductCategoryCode.SCENIC_CRUISE,
      subtypeCode: TravelProductSubtypeCode.ZODIAC_BOAT,
      displayNameZh: '杰古沙龙 Zodiac 快艇',
      displayNameEn: 'Jökulsárlón Zodiac Boat',
      typicalDurationMin: 75,
      fitnessLevel: 'LOW',
      riskLevel: 'MEDIUM',
      recommendedMinAge: 6,
      weatherDependency: 'HIGH',
      commonCancelReasons: ['high_wind', 'storm', 'high_seas'],
      requiresGuide: true,
      relatedExperienceAtomCodes: ['GLACIER_ADVENTURE'],
      countryCodes: ['IS'],
      metadata: { venueHint: 'Jokulsarlon', planningOnly: true },
    },
    {
      code: 'EXP_JOKULSARLON_PRIVATE_SPEEDBOAT',
      productType: TravelProductType.CRUISE_BOAT_TOUR,
      categoryCode: TravelProductCategoryCode.SCENIC_CRUISE,
      subtypeCode: TravelProductSubtypeCode.SPEEDBOAT_TOUR,
      displayNameZh: '杰古沙龙私人快艇',
      displayNameEn: 'Jökulsárlón Private Speedboat',
      typicalDurationMin: 60,
      fitnessLevel: 'LOW',
      riskLevel: 'MEDIUM',
      weatherDependency: 'HIGH',
      requiresGuide: true,
      relatedExperienceAtomCodes: ['GLACIER_ADVENTURE'],
      countryCodes: ['IS'],
      metadata: { venueHint: 'Jokulsarlon', planningOnly: true, privateCharter: true },
    },
    {
      code: 'EXP_JOKULSARLON_KAYAK',
      productType: TravelProductType.ACTIVITY_EXPERIENCE,
      categoryCode: TravelProductCategoryCode.WATER_SPORT,
      subtypeCode: TravelProductSubtypeCode.KAYAKING,
      displayNameZh: '杰古沙龙冰河湖皮划艇',
      displayNameEn: 'Jökulsárlón Lagoon Kayaking',
      typicalDurationMin: 150,
      fitnessLevel: 'MODERATE',
      riskLevel: 'MEDIUM',
      recommendedMinAge: 12,
      equipmentTypical: ['drysuit', 'kayak', 'paddle'],
      weatherDependency: 'HIGH',
      commonCancelReasons: ['high_wind', 'ice_conditions', 'storm'],
      requiresGuide: true,
      relatedExperienceAtomCodes: ['GLACIER_ADVENTURE'],
      countryCodes: ['IS'],
      metadata: { venueHint: 'Jokulsarlon', planningOnly: true },
    },
    {
      code: 'EXP_JOKULSARLON_PHOTOGRAPHY',
      productType: TravelProductType.GUIDED_TOUR,
      categoryCode: TravelProductCategoryCode.THEMED_TOUR,
      subtypeCode: TravelProductSubtypeCode.PHOTOGRAPHY_TOUR,
      displayNameZh: '杰古沙龙摄影团',
      displayNameEn: 'Jökulsárlón Photography Tour',
      typicalDurationMin: 180,
      fitnessLevel: 'LOW',
      riskLevel: 'LOW',
      weatherDependency: 'MODERATE',
      requiresGuide: true,
      relatedExperienceAtomCodes: ['CINEMATIC_PHOTOGRAPHY'],
      countryCodes: ['IS'],
      metadata: { venueHint: 'Jokulsarlon', planningOnly: true },
    },
    {
      code: 'EXP_JOKULSARLON_LAGOON_ICE_CAVE_COMBO',
      productType: TravelProductType.ACTIVITY_EXPERIENCE,
      categoryCode: TravelProductCategoryCode.EXPERIENCE_PACKAGE,
      subtypeCode: TravelProductSubtypeCode.EXPERIENCE_COMBO,
      displayNameZh: '冰河湖＋冰洞组合',
      displayNameEn: 'Lagoon + Ice Cave Combo',
      typicalDurationMin: 360,
      fitnessLevel: 'MODERATE',
      riskLevel: 'HIGH',
      weatherDependency: 'CRITICAL',
      commonCancelReasons: ['storm', 'cave_access_closed', 'road_closed'],
      requiresGuide: true,
      relatedExperienceAtomCodes: ['GLACIER_ADVENTURE'],
      countryCodes: ['IS'],
      metadata: {
        venueHint: 'Jokulsarlon',
        planningOnly: true,
        comboParts: ['EXP_JOKULSARLON_AMPHIBIOUS_BOAT', 'EXP_ICE_CAVE_TOUR'],
      },
    },
    {
      code: 'EXP_JOKULSARLON_LAGOON_GLACIER_HIKE_COMBO',
      productType: TravelProductType.ACTIVITY_EXPERIENCE,
      categoryCode: TravelProductCategoryCode.EXPERIENCE_PACKAGE,
      subtypeCode: TravelProductSubtypeCode.EXPERIENCE_COMBO,
      displayNameZh: '冰河湖＋冰川徒步组合',
      displayNameEn: 'Lagoon + Glacier Hike Combo',
      typicalDurationMin: 420,
      fitnessLevel: 'MODERATE',
      riskLevel: 'HIGH',
      weatherDependency: 'HIGH',
      requiresGuide: true,
      relatedExperienceAtomCodes: ['GLACIER_ADVENTURE'],
      countryCodes: ['IS'],
      metadata: {
        venueHint: 'Jokulsarlon',
        planningOnly: true,
        comboParts: ['EXP_JOKULSARLON_ZODIAC', 'EXP_GLACIER_HIKING'],
      },
    },
    {
      code: 'EXP_JOKULSARLON_HELICOPTER',
      productType: TravelProductType.SCENIC_FLIGHT,
      categoryCode: TravelProductCategoryCode.AIR_SIGHTSEEING,
      subtypeCode: TravelProductSubtypeCode.HELICOPTER_TOUR,
      displayNameZh: '冰河湖直升机观光',
      displayNameEn: 'Jökulsárlón Helicopter Sightseeing',
      typicalDurationMin: 60,
      fitnessLevel: 'LOW',
      riskLevel: 'MEDIUM',
      weatherDependency: 'CRITICAL',
      commonCancelReasons: ['low_visibility', 'high_wind', 'icing'],
      requiresGuide: false,
      requiresLicense: true,
      relatedExperienceAtomCodes: ['GLACIER_ADVENTURE', 'CINEMATIC_PHOTOGRAPHY'],
      countryCodes: ['IS'],
      metadata: { venueHint: 'Jokulsarlon', planningOnly: true },
    },
  ];
