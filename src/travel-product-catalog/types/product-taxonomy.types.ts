/**
 * Travel Product Catalog — 三级分类契约（v1）
 *
 * ProductType（固定枚举）→ Category（平台维护）→ Subtype（可扩展字典）
 *
 * SSOT for planning: places stay geographic; sellable / bookable services live here.
 */

export const TRAVEL_PRODUCT_TAXONOMY_SCHEMA_ID = 'tripnara.travel_product_taxonomy@v1';

/** 一级类型：固定枚举，保证系统逻辑稳定 */
export const TravelProductType = {
  ACTIVITY_EXPERIENCE: 'ACTIVITY_EXPERIENCE',
  SCENIC_FLIGHT: 'SCENIC_FLIGHT',
  CRUISE_BOAT_TOUR: 'CRUISE_BOAT_TOUR',
  GUIDED_TOUR: 'GUIDED_TOUR',
  ADMISSION_TICKET: 'ADMISSION_TICKET',
  TRANSPORT_SERVICE: 'TRANSPORT_SERVICE',
  RENTAL: 'RENTAL',
  DINING_RESERVATION: 'DINING_RESERVATION',
} as const;

export type TravelProductType =
  (typeof TravelProductType)[keyof typeof TravelProductType];

export const TRAVEL_PRODUCT_TYPES = Object.values(
  TravelProductType,
) as readonly TravelProductType[];

/**
 * 二级 Category：平台维护的稳定码（非 DB 固定 enum）。
 * 新增类别只改平台字典，不改一级枚举 / 主表结构。
 */
export const TravelProductCategoryCode = {
  // ACTIVITY_EXPERIENCE
  HIKING: 'HIKING',
  ICE_SNOW: 'ICE_SNOW',
  WATER_SPORT: 'WATER_SPORT',
  OUTDOOR_ADVENTURE: 'OUTDOOR_ADVENTURE',
  WILDLIFE_NATURE: 'WILDLIFE_NATURE',
  CULTURAL_EXPERIENCE: 'CULTURAL_EXPERIENCE',
  WELLNESS: 'WELLNESS',
  /// 多活动组合（规划层体验项目，非供应商套餐 SKU）
  EXPERIENCE_PACKAGE: 'EXPERIENCE_PACKAGE',

  // SCENIC_FLIGHT
  AIR_SIGHTSEEING: 'AIR_SIGHTSEEING',

  // CRUISE_BOAT_TOUR
  WILDLIFE_WATCHING: 'WILDLIFE_WATCHING',
  SCENIC_CRUISE: 'SCENIC_CRUISE',
  FISHING_CHARTER: 'FISHING_CHARTER',

  // GUIDED_TOUR
  WALKING_TOUR: 'WALKING_TOUR',
  DAY_TOUR: 'DAY_TOUR',
  MULTI_DAY_TOUR: 'MULTI_DAY_TOUR',
  PRIVATE_TOUR: 'PRIVATE_TOUR',
  THEMED_TOUR: 'THEMED_TOUR',

  // ADMISSION_TICKET
  ATTRACTION_TICKET: 'ATTRACTION_TICKET',
  EVENT_TICKET: 'EVENT_TICKET',
  PASS_TICKET: 'PASS_TICKET',
  TIMED_ENTRY: 'TIMED_ENTRY',

  // TRANSPORT_SERVICE
  TRANSFER: 'TRANSFER',
  INTERCITY: 'INTERCITY',
  SPECIAL_TERRAIN_TRANSFER: 'SPECIAL_TERRAIN_TRANSFER',

  // RENTAL
  VEHICLE_RENTAL: 'VEHICLE_RENTAL',
  EQUIPMENT_RENTAL: 'EQUIPMENT_RENTAL',

  // DINING_RESERVATION
  RESTAURANT_BOOKING: 'RESTAURANT_BOOKING',
  DINING_PACKAGE: 'DINING_PACKAGE',
} as const;

export type TravelProductCategoryCode =
  (typeof TravelProductCategoryCode)[keyof typeof TravelProductCategoryCode];

/**
 * 三级 Subtype：可扩展字典码。
 * Phase-1 种子覆盖冰岛 P0/P1；新活动加码即可，不必改库表结构。
 */
export const TravelProductSubtypeCode = {
  // Hiking / outdoor
  GLACIER_HIKING: 'GLACIER_HIKING',
  VOLCANO_HIKING: 'VOLCANO_HIKING',
  CANYON_HIKING: 'CANYON_HIKING',
  ICE_CAVE_TOUR: 'ICE_CAVE_TOUR',
  SNOWMOBILE: 'SNOWMOBILE',
  DOG_SLEDDING: 'DOG_SLEDDING',
  HORSE_RIDING: 'HORSE_RIDING',
  SNORKELING: 'SNORKELING',
  DIVING: 'DIVING',
  KAYAKING: 'KAYAKING',
  RAFTING: 'RAFTING',

  // Air
  HELICOPTER_TOUR: 'HELICOPTER_TOUR',
  SMALL_PLANE_TOUR: 'SMALL_PLANE_TOUR',
  SEAPLANE_TOUR: 'SEAPLANE_TOUR',
  HOT_AIR_BALLOON: 'HOT_AIR_BALLOON',
  PARAGLIDING: 'PARAGLIDING',
  SKYDIVING: 'SKYDIVING',
  VOLCANO_AERIAL_TOUR: 'VOLCANO_AERIAL_TOUR',

  // Boat
  WHALE_WATCHING: 'WHALE_WATCHING',
  GLACIER_LAGOON_BOAT: 'GLACIER_LAGOON_BOAT',
  AMPHIBIOUS_BOAT: 'AMPHIBIOUS_BOAT',
  ZODIAC_BOAT: 'ZODIAC_BOAT',
  NORTHERN_LIGHTS_CRUISE: 'NORTHERN_LIGHTS_CRUISE',
  FJORD_CRUISE: 'FJORD_CRUISE',
  SPEEDBOAT_TOUR: 'SPEEDBOAT_TOUR',
  PRIVATE_YACHT: 'PRIVATE_YACHT',
  GLASS_BOTTOM_BOAT: 'GLASS_BOTTOM_BOAT',
  SEA_FISHING: 'SEA_FISHING',

  // Packages / combos (planning-layer experience items)
  EXPERIENCE_COMBO: 'EXPERIENCE_COMBO',

  // Guided
  CITY_WALKING_TOUR: 'CITY_WALKING_TOUR',
  CITY_SIGHTSEEING: 'CITY_SIGHTSEEING',
  GOLDEN_CIRCLE_BUS_TOUR: 'GOLDEN_CIRCLE_BUS_TOUR',
  PRIVATE_DRIVER_TOUR: 'PRIVATE_DRIVER_TOUR',
  MULTI_DAY_GROUP_TOUR: 'MULTI_DAY_GROUP_TOUR',
  PHOTOGRAPHY_TOUR: 'PHOTOGRAPHY_TOUR',
  NORTHERN_LIGHTS_HUNT: 'NORTHERN_LIGHTS_HUNT',
  FOOD_TOUR: 'FOOD_TOUR',
  SELF_DRIVE_CONVOY: 'SELF_DRIVE_CONVOY',

  // Tickets
  ATTRACTION_ADMISSION: 'ATTRACTION_ADMISSION',
  MUSEUM_ADMISSION: 'MUSEUM_ADMISSION',
  HOT_SPRING_ADMISSION: 'HOT_SPRING_ADMISSION',
  SHOW_TICKET: 'SHOW_TICKET',
  EVENT_ADMISSION: 'EVENT_ADMISSION',
  TIMED_ENTRY_SLOT: 'TIMED_ENTRY_SLOT',
  CITY_PASS: 'CITY_PASS',
  FAST_TRACK: 'FAST_TRACK',
  RESERVATION_VOUCHER: 'RESERVATION_VOUCHER',

  // Transport
  AIRPORT_TRANSFER: 'AIRPORT_TRANSFER',
  HOTEL_SHUTTLE: 'HOTEL_SHUTTLE',
  ATTRACTION_SHUTTLE: 'ATTRACTION_SHUTTLE',
  INTERCITY_BUS: 'INTERCITY_BUS',
  FERRY: 'FERRY',
  TRAIN_TICKET: 'TRAIN_TICKET',
  PRIVATE_CHARTER: 'PRIVATE_CHARTER',
  LUGGAGE_TRANSFER: 'LUGGAGE_TRANSFER',

  // Rental
  CAR_RENTAL: 'CAR_RENTAL',
  CAMPERVAN_RENTAL: 'CAMPERVAN_RENTAL',
  BIKE_RENTAL: 'BIKE_RENTAL',
  MOTORCYCLE_RENTAL: 'MOTORCYCLE_RENTAL',
  SKI_EQUIPMENT_RENTAL: 'SKI_EQUIPMENT_RENTAL',
  HIKING_EQUIPMENT_RENTAL: 'HIKING_EQUIPMENT_RENTAL',
  CAMPING_EQUIPMENT_RENTAL: 'CAMPING_EQUIPMENT_RENTAL',
  COLD_WEATHER_GEAR_RENTAL: 'COLD_WEATHER_GEAR_RENTAL',
  WATER_EQUIPMENT_RENTAL: 'WATER_EQUIPMENT_RENTAL',

  // Dining
  RESTAURANT_TABLE: 'RESTAURANT_TABLE',
  SET_MENU: 'SET_MENU',
  CHEFS_TABLE: 'CHEFS_TABLE',
  AFTERNOON_TEA: 'AFTERNOON_TEA',
  WINE_TASTING: 'WINE_TASTING',
  SPECIAL_HOLIDAY_MEAL: 'SPECIAL_HOLIDAY_MEAL',
  GROUP_DINING: 'GROUP_DINING',
  HOTEL_MEAL_PACKAGE: 'HOTEL_MEAL_PACKAGE',
} as const;

export type TravelProductSubtypeCode =
  (typeof TravelProductSubtypeCode)[keyof typeof TravelProductSubtypeCode];

/** 可扩展 subtype：种子码 ∪ 任意新字符串（后续字典表） */
export type ExtensibleProductSubtypeCode = TravelProductSubtypeCode | (string & {});

export interface TravelProductCategoryDefinition {
  code: TravelProductCategoryCode | (string & {});
  productType: TravelProductType;
  displayNameZh: string;
  displayNameEn: string;
  /** 平台维护版本，便于热更新 */
  version: number;
}

export interface TravelProductSubtypeDefinition {
  code: ExtensibleProductSubtypeCode;
  categoryCode: TravelProductCategoryCode | (string & {});
  productType: TravelProductType;
  displayNameZh: string;
  displayNameEn: string;
  /** P0 / P1 / P2 建设优先级 */
  phasePriority: 'P0' | 'P1' | 'P2';
  countryCodes?: readonly string[];
}

export interface ProductTaxonomyRef {
  productType: TravelProductType;
  categoryCode: string;
  subtypeCode: ExtensibleProductSubtypeCode;
}

export function isTravelProductType(value: string): value is TravelProductType {
  return (TRAVEL_PRODUCT_TYPES as readonly string[]).includes(value);
}

export function assertTaxonomyAligns(ref: ProductTaxonomyRef, categoryProductType: TravelProductType): void {
  if (ref.productType !== categoryProductType) {
    throw new Error(
      `Taxonomy mismatch: subtype under ${ref.productType} but category belongs to ${categoryProductType}`,
    );
  }
}
