/**
 * Itinerary ↔ Product Catalog 绑定契约（v1）
 *
 * Prisma ItemType 暂不扩 enum（避免大迁移）；运行时用 displayType + catalog FK。
 */

import type { TravelProductType } from './product-taxonomy.types';
import type { CatalogItineraryItemType } from './catalog-entities.types';
import { PRODUCT_TYPE_TO_ITINERARY_ITEM_TYPE } from './catalog-entities.types';

export const ITINERARY_PRODUCT_BINDING_SCHEMA_ID =
  'tripnara.itinerary_product_binding@v1';

/** Prisma ItemType → 目录展示类型的保守映射 */
export type PrismaItineraryItemType =
  | 'ACTIVITY'
  | 'REST'
  | 'MEAL_ANCHOR'
  | 'MEAL_FLOATING'
  | 'TRANSIT';

export function mapPrismaItemTypeToCatalogDisplay(
  itemType: PrismaItineraryItemType,
  productType?: TravelProductType | null,
): CatalogItineraryItemType {
  if (productType) {
    return PRODUCT_TYPE_TO_ITINERARY_ITEM_TYPE[productType];
  }
  switch (itemType) {
    case 'TRANSIT':
      return 'TRANSPORT';
    case 'MEAL_ANCHOR':
    case 'MEAL_FLOATING':
      return 'DINING';
    case 'REST':
      return 'FREE_TIME';
    case 'ACTIVITY':
    default:
      return 'PLACE_VISIT';
  }
}

/** 行程项上挂接产品时的最小载荷（写入 ItineraryItem 列 + note/metadata） */
export interface ItineraryProductBinding {
  displayType: CatalogItineraryItemType;
  experienceDefinitionId?: string;
  productOfferingId?: string;
  productSessionId?: string;
  operatorId?: string;
  /** 集合时间优先于活动开始时间展示 */
  meetTimeLocal?: string;
  activityStartLocal?: string;
  activityEndLocal?: string;
  meetingPlaceId?: number;
  weatherDependent?: boolean;
  hardTimeWindow?: boolean;
  cancelDeadlineAt?: string;
  equipmentRequired?: string[];
  participantMemberIds?: string[];
}

/** 冰川徒步类卡片建议展示字段 */
export const ACTIVITY_CARD_REQUIRED_FIELDS = [
  'meetTimeLocal',
  'meetingPlaceId',
  'activityStartLocal',
  'activityEndLocal',
  'productSessionId',
  'equipmentRequired',
  'cancelDeadlineAt',
  'weatherDependent',
  'hardTimeWindow',
] as const;
