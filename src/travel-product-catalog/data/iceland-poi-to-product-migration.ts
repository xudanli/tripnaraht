/**
 * IcelandCanonicalType → Travel Product Catalog 迁出清单（v1）
 *
 * 原则：
 * - Place / POI 只保留地理实体与设施
 * - 可预约履约服务迁到 ExperienceDefinition + ProductOffering
 * - 观景点（海鹦崖）保留 Place；「观鲸游船」是产品
 */

import { IcelandCanonicalType } from '../../places/types/iceland-poi-categories';
import {
  TravelProductCategoryCode,
  TravelProductSubtypeCode,
  TravelProductType,
  type ProductTaxonomyRef,
} from '../types/product-taxonomy.types';

export type IcelandPoiMigrationAction =
  /** 应从 Place taxonomy 迁出；新数据不得再用该 canonical 作 Place */
  | 'MIGRATE_TO_PRODUCT'
  /** 保留为 Place；相关票务/活动建产品并挂 spatial link */
  | 'KEEP_AS_PLACE'
  /** 边界：可同时存在 Place 设施点 + 产品（如租车点 / 温泉池） */
  | 'SPLIT_PLACE_AND_PRODUCT';

export interface IcelandCanonicalMigrationEntry {
  canonicalType: string;
  action: IcelandPoiMigrationAction;
  rationale: string;
  /** 若迁出或拆分，目标 taxonomy */
  targetTaxonomy?: ProductTaxonomyRef;
  /** 建议保留/新建的 Place 角色 */
  suggestedPlaceRoles?: string[];
  /** 对应 Experience Definition 建议 code */
  experienceDefinitionCode?: string;
  phasePriority?: 'P0' | 'P1' | 'P2';
}

/**
 * 明确误入 ACTIVITY / 活动语义的 canonical 值。
 * 读取该表可驱动 lint / 导入阻断（后续接线）。
 */
export const ICELAND_CANONICAL_TO_PRODUCT_MIGRATION: readonly IcelandCanonicalMigrationEntry[] =
  [
    {
      canonicalType: IcelandCanonicalType.GLACIER_WALK,
      action: 'MIGRATE_TO_PRODUCT',
      rationale: '冰川徒步是可预约活动，不是地理实体；冰川本体用 ATTRACTION_NATURE_GLACIER',
      targetTaxonomy: {
        productType: TravelProductType.ACTIVITY_EXPERIENCE,
        categoryCode: TravelProductCategoryCode.OUTDOOR_ADVENTURE,
        subtypeCode: TravelProductSubtypeCode.GLACIER_HIKING,
      },
      suggestedPlaceRoles: ['meetingPoint', 'operatingArea', 'parking'],
      experienceDefinitionCode: 'EXP_GLACIER_HIKING',
      phasePriority: 'P0',
    },
    {
      canonicalType: IcelandCanonicalType.ICE_CAVE,
      action: 'MIGRATE_TO_PRODUCT',
      rationale: '冰洞探险为向导带队产品；洞穴地理实体用 ATTRACTION_NATURE_CAVE / 冰川相关 Place',
      targetTaxonomy: {
        productType: TravelProductType.ACTIVITY_EXPERIENCE,
        categoryCode: TravelProductCategoryCode.ICE_SNOW,
        subtypeCode: TravelProductSubtypeCode.ICE_CAVE_TOUR,
      },
      suggestedPlaceRoles: ['meetingPoint', 'operatingArea'],
      experienceDefinitionCode: 'EXP_ICE_CAVE_TOUR',
      phasePriority: 'P0',
    },
    {
      canonicalType: IcelandCanonicalType.SNOWMOBILE,
      action: 'MIGRATE_TO_PRODUCT',
      rationale: '雪地摩托为装备+向导履约产品，不是地点',
      targetTaxonomy: {
        productType: TravelProductType.ACTIVITY_EXPERIENCE,
        categoryCode: TravelProductCategoryCode.ICE_SNOW,
        subtypeCode: TravelProductSubtypeCode.SNOWMOBILE,
      },
      suggestedPlaceRoles: ['meetingPoint', 'operatingArea'],
      experienceDefinitionCode: 'EXP_SNOWMOBILE',
      phasePriority: 'P0',
    },
    {
      canonicalType: IcelandCanonicalType.NORTHERN_LIGHTS_TOUR,
      action: 'MIGRATE_TO_PRODUCT',
      rationale: '极光团是导览产品；AURORA_VIEWING 作为观景 Point 可保留',
      targetTaxonomy: {
        productType: TravelProductType.GUIDED_TOUR,
        categoryCode: TravelProductCategoryCode.THEMED_TOUR,
        subtypeCode: TravelProductSubtypeCode.NORTHERN_LIGHTS_HUNT,
      },
      suggestedPlaceRoles: ['meetingPoint', 'pickupPoints', 'relatedPlaces'],
      experienceDefinitionCode: 'EXP_NORTHERN_LIGHTS_HUNT',
      phasePriority: 'P0',
    },
    {
      canonicalType: IcelandCanonicalType.WHALE_WATCHING,
      action: 'MIGRATE_TO_PRODUCT',
      rationale:
        '「观鲸」产品属游船观光；水域热点用 ATTRACTION_NATURE_WHALE_AREA，码头用港口 Place',
      targetTaxonomy: {
        productType: TravelProductType.CRUISE_BOAT_TOUR,
        categoryCode: TravelProductCategoryCode.WILDLIFE_WATCHING,
        subtypeCode: TravelProductSubtypeCode.WHALE_WATCHING,
      },
      suggestedPlaceRoles: ['meetingPoint', 'startPoint', 'operatingArea'],
      experienceDefinitionCode: 'EXP_WHALE_WATCHING',
      phasePriority: 'P0',
    },
    {
      canonicalType: IcelandCanonicalType.HORSE_RIDING,
      action: 'MIGRATE_TO_PRODUCT',
      rationale: '骑马体验为活动产品；马场可作为 Place + meetingPoint',
      targetTaxonomy: {
        productType: TravelProductType.ACTIVITY_EXPERIENCE,
        categoryCode: TravelProductCategoryCode.WILDLIFE_NATURE,
        subtypeCode: TravelProductSubtypeCode.HORSE_RIDING,
      },
      suggestedPlaceRoles: ['meetingPoint', 'operatingArea'],
      experienceDefinitionCode: 'EXP_HORSE_RIDING',
      phasePriority: 'P1',
    },
    {
      canonicalType: IcelandCanonicalType.DIVING_SNORKELING,
      action: 'MIGRATE_TO_PRODUCT',
      rationale: '潜水/浮潜为活动产品；裂谷/潜点为 Place',
      targetTaxonomy: {
        productType: TravelProductType.ACTIVITY_EXPERIENCE,
        categoryCode: TravelProductCategoryCode.WATER_SPORT,
        subtypeCode: TravelProductSubtypeCode.SNORKELING,
      },
      suggestedPlaceRoles: ['meetingPoint', 'operatingArea'],
      experienceDefinitionCode: 'EXP_SNORKEL_DIVE',
      phasePriority: 'P1',
    },
    {
      canonicalType: IcelandCanonicalType.KAYAKING,
      action: 'MIGRATE_TO_PRODUCT',
      rationale: '皮划艇为活动/租赁产品，水道为 Place',
      targetTaxonomy: {
        productType: TravelProductType.ACTIVITY_EXPERIENCE,
        categoryCode: TravelProductCategoryCode.WATER_SPORT,
        subtypeCode: TravelProductSubtypeCode.KAYAKING,
      },
      suggestedPlaceRoles: ['meetingPoint', 'startPoint', 'endPoint'],
      experienceDefinitionCode: 'EXP_KAYAKING',
      phasePriority: 'P1',
    },

    // —— 保留为 Place（设施 / 路线实体）——
    {
      canonicalType: IcelandCanonicalType.TRAILHEAD,
      action: 'KEEP_AS_PLACE',
      rationale: '徒步起点是集合/停车地理实体',
      suggestedPlaceRoles: ['meetingPoint', 'parking'],
    },
    {
      canonicalType: IcelandCanonicalType.HIKING_TRAIL,
      action: 'KEEP_AS_PLACE',
      rationale: '步道几何属于 Trail/Place，导览团另建 GUIDED_TOUR / ACTIVITY',
    },
    {
      canonicalType: IcelandCanonicalType.BIKE_TRAIL,
      action: 'KEEP_AS_PLACE',
      rationale: '自行车道为基础设施；单车租赁为 RENTAL 产品',
    },
    {
      canonicalType: IcelandCanonicalType.PUFFIN_WATCHING,
      action: 'KEEP_AS_PLACE',
      rationale: '观海鹦点是观测地点；若有收费游船另建 CRUISE_BOAT_TOUR',
    },
    {
      canonicalType: IcelandCanonicalType.AURORA_VIEWING,
      action: 'KEEP_AS_PLACE',
      rationale: '极光观景点保留；跟团产品用 NORTHERN_LIGHTS_TOUR 迁出后的导览 SKU',
    },
    {
      canonicalType: IcelandCanonicalType.ATTRACTION_NATURE_GLACIER,
      action: 'KEEP_AS_PLACE',
      rationale: '冰川地理实体；其上活动挂 EXPERIENCE + Offering',
    },
    {
      canonicalType: IcelandCanonicalType.ATTRACTION_NATURE_GLACIER_LAGOON,
      action: 'KEEP_AS_PLACE',
      rationale: '冰河湖地点；两栖船等为 CRUISE_BOAT_TOUR',
      suggestedPlaceRoles: ['relatedPlaces', 'operatingArea'],
    },
    {
      canonicalType: IcelandCanonicalType.ATTRACTION_NATURE_WHALE_AREA,
      action: 'KEEP_AS_PLACE',
      rationale: '观鲸水域热点，不是游船班次',
    },
    {
      canonicalType: IcelandCanonicalType.TOUR_OPERATOR,
      action: 'KEEP_AS_PLACE',
      rationale: '运营商办公室/柜台可为 Place；主体履约方进 Operator Directory',
    },

    // —— 拆分 ——
    {
      canonicalType: IcelandCanonicalType.SWIMMING_POOL,
      action: 'SPLIT_PLACE_AND_PRODUCT',
      rationale: '泳池地点保留；入场/时段票进 ADMISSION_TICKET',
      targetTaxonomy: {
        productType: TravelProductType.ADMISSION_TICKET,
        categoryCode: TravelProductCategoryCode.ATTRACTION_TICKET,
        subtypeCode: TravelProductSubtypeCode.ATTRACTION_ADMISSION,
      },
      phasePriority: 'P1',
    },
    {
      canonicalType: IcelandCanonicalType.SPA_POOL,
      action: 'SPLIT_PLACE_AND_PRODUCT',
      rationale: '蓝湖等为 Place；Comfort/Premium + 时段为票务产品',
      targetTaxonomy: {
        productType: TravelProductType.ADMISSION_TICKET,
        categoryCode: TravelProductCategoryCode.TIMED_ENTRY,
        subtypeCode: TravelProductSubtypeCode.HOT_SPRING_ADMISSION,
      },
      experienceDefinitionCode: 'EXP_HOT_SPRING_ADMISSION',
      phasePriority: 'P0',
    },
    {
      canonicalType: IcelandCanonicalType.HOT_TUB,
      action: 'SPLIT_PLACE_AND_PRODUCT',
      rationale: '设施点保留；预约入场另建票务',
      targetTaxonomy: {
        productType: TravelProductType.ADMISSION_TICKET,
        categoryCode: TravelProductCategoryCode.TIMED_ENTRY,
        subtypeCode: TravelProductSubtypeCode.HOT_SPRING_ADMISSION,
      },
      phasePriority: 'P0',
    },
    {
      canonicalType: IcelandCanonicalType.CAR_RENTAL,
      action: 'SPLIT_PLACE_AND_PRODUCT',
      rationale: '取还车点为 Place；租车 SKU 为 RENTAL 产品',
      targetTaxonomy: {
        productType: TravelProductType.RENTAL,
        categoryCode: TravelProductCategoryCode.VEHICLE_RENTAL,
        subtypeCode: TravelProductSubtypeCode.CAR_RENTAL,
      },
      suggestedPlaceRoles: ['startPoint', 'endPoint'],
      experienceDefinitionCode: 'EXP_CAR_RENTAL',
      phasePriority: 'P1',
    },
  ];

export const ICELAND_MIGRATE_TO_PRODUCT_TYPES: ReadonlySet<string> = new Set(
  ICELAND_CANONICAL_TO_PRODUCT_MIGRATION.filter(
    (e) => e.action === 'MIGRATE_TO_PRODUCT',
  ).map((e) => e.canonicalType),
);

export function getIcelandCanonicalMigration(
  canonicalType: string,
): IcelandCanonicalMigrationEntry | undefined {
  return ICELAND_CANONICAL_TO_PRODUCT_MIGRATION.find(
    (e) => e.canonicalType === canonicalType,
  );
}

export function isCanonicalTypeBlockedForNewPlaces(canonicalType: string): boolean {
  return ICELAND_MIGRATE_TO_PRODUCT_TYPES.has(canonicalType);
}
