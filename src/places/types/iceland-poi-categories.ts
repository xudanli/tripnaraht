// src/places/types/iceland-poi-categories.ts

/**
 * 冰岛 POI 分类枚举
 * 
 * 基于冰岛实际旅游场景反推的分类体系
 * 包含：自然景观、基础设施、服务设施、安全保障、活动体验
 */

// ============================================
// 一、高级分类 (PlaceCategory) - 数据库存储
// ============================================

/**
 * 一级分类 - 与 Prisma PlaceCategory 对应
 * 注意：这是现有枚举的扩展建议
 */
export type PlaceCategoryExtended =
  | 'ATTRACTION'      // 景点（自然/人文）
  | 'RESTAURANT'      // 餐饮
  | 'SHOPPING'        // 购物
  | 'HOTEL'           // 住宿
  | 'TRANSIT_HUB'     // 交通枢纽
  | 'HOSPITAL'        // 医疗（现有）
  // 建议新增
  | 'SUPPLY'          // 补给点（加油站、超市等）
  | 'SAFETY'          // 安全设施（警察局、消防等）
  | 'SERVICE'         // 服务设施（游客中心、租车等）
  | 'ACTIVITY'        // 活动体验（徒步起点、观鲸等）
  | 'INFRASTRUCTURE'; // 基础设施（停车场、厕所等）

// ============================================
// 二、详细分类 (CanonicalType) - metadata 存储
// ============================================

/**
 * 冰岛 POI 详细分类枚举
 * 存储在 Place.metadata.canonicalType
 */
export const IcelandCanonicalType = {
  // ========== 自然景观 (ATTRACTION) ==========
  // 地质景观
  ATTRACTION_NATURE_VOLCANO: 'ATTRACTION_NATURE_VOLCANO',           // 火山
  ATTRACTION_NATURE_LAVA_FIELD: 'ATTRACTION_NATURE_LAVA_FIELD',     // 熔岩区
  ATTRACTION_NATURE_CRATER: 'ATTRACTION_NATURE_CRATER',             // 火山口
  ATTRACTION_NATURE_GEOTHERMAL: 'ATTRACTION_NATURE_GEOTHERMAL',     // 地热区
  
  // 水文景观
  ATTRACTION_NATURE_WATERFALL: 'ATTRACTION_NATURE_WATERFALL',       // 瀑布
  ATTRACTION_NATURE_GEYSER: 'ATTRACTION_NATURE_GEYSER',             // 间歇泉
  ATTRACTION_NATURE_HOT_SPRING: 'ATTRACTION_NATURE_HOT_SPRING',     // 温泉
  ATTRACTION_NATURE_GLACIER: 'ATTRACTION_NATURE_GLACIER',           // 冰川
  ATTRACTION_NATURE_GLACIER_LAGOON: 'ATTRACTION_NATURE_GLACIER_LAGOON', // 冰川湖
  ATTRACTION_NATURE_FJORD: 'ATTRACTION_NATURE_FJORD',               // 峡湾
  ATTRACTION_NATURE_LAKE: 'ATTRACTION_NATURE_LAKE',                 // 湖泊
  ATTRACTION_NATURE_RIVER: 'ATTRACTION_NATURE_RIVER',               // 河流
  
  // 海岸景观
  ATTRACTION_NATURE_BEACH: 'ATTRACTION_NATURE_BEACH',               // 海滩
  ATTRACTION_NATURE_BLACK_BEACH: 'ATTRACTION_NATURE_BLACK_BEACH',   // 黑沙滩
  ATTRACTION_NATURE_SEA_CLIFF: 'ATTRACTION_NATURE_SEA_CLIFF',       // 海蚀崖
  ATTRACTION_NATURE_COASTLINE: 'ATTRACTION_NATURE_COASTLINE',       // 海岸线
  
  // 地形景观
  ATTRACTION_NATURE_CANYON: 'ATTRACTION_NATURE_CANYON',             // 峡谷
  ATTRACTION_NATURE_CAVE: 'ATTRACTION_NATURE_CAVE',                 // 洞穴
  ATTRACTION_NATURE_MOUNTAIN: 'ATTRACTION_NATURE_MOUNTAIN',         // 山峰
  ATTRACTION_NATURE_VALLEY: 'ATTRACTION_NATURE_VALLEY',             // 山谷
  ATTRACTION_NATURE_HIGHLAND: 'ATTRACTION_NATURE_HIGHLAND',         // 高地
  
  // 生态景观
  ATTRACTION_NATURE_BIRD_CLIFF: 'ATTRACTION_NATURE_BIRD_CLIFF',     // 鸟崖
  ATTRACTION_NATURE_SEAL_COLONY: 'ATTRACTION_NATURE_SEAL_COLONY',   // 海豹栖息地
  ATTRACTION_NATURE_WHALE_AREA: 'ATTRACTION_NATURE_WHALE_AREA',     // 鲸鱼活动区
  
  // 保护区
  NATIONAL_PARK: 'NATIONAL_PARK',                                   // 国家公园
  NATURE_RESERVE: 'NATURE_RESERVE',                                 // 自然保护区
  
  // 观景点
  VIEWPOINT: 'VIEWPOINT',                                           // 观景台
  PHOTO_SPOT: 'PHOTO_SPOT',                                         // 摄影点
  AURORA_VIEWING: 'AURORA_VIEWING',                                 // 极光观测点
  
  // ========== 人文景观 (ATTRACTION) ==========
  MUSEUM: 'MUSEUM',                                                 // 博物馆
  CHURCH: 'CHURCH',                                                 // 教堂
  HISTORICAL_SITE: 'HISTORICAL_SITE',                               // 历史遗迹
  SCULPTURE: 'SCULPTURE',                                           // 雕塑
  MONUMENT: 'MONUMENT',                                             // 纪念碑
  LIGHTHOUSE: 'LIGHTHOUSE',                                         // 灯塔
  
  // ========== 交通 (TRANSIT_HUB) ==========
  AIRPORT: 'AIRPORT',                                               // 机场
  AIRPORT_DOMESTIC: 'AIRPORT_DOMESTIC',                             // 国内机场
  PORT_FERRY_TERMINAL: 'PORT_FERRY_TERMINAL',                       // 渡轮码头
  PORT_PIER: 'PORT_PIER',                                           // 码头
  BUS_STATION: 'BUS_STATION',                                       // 巴士站
  PARKING: 'PARKING',                                               // 停车场
  PARKING_FREE: 'PARKING_FREE',                                     // 免费停车场
  PARKING_PAID: 'PARKING_PAID',                                     // 付费停车场
  REST_STOP: 'REST_STOP',                                           // 休息站
  
  // ========== 补给 (SUPPLY) ==========
  FUEL_STATION: 'FUEL_STATION',                                     // 加油站
  FUEL_N1: 'FUEL_N1',                                               // N1 加油站
  FUEL_ORKAN: 'FUEL_ORKAN',                                         // Orkan 加油站
  FUEL_OB: 'FUEL_OB',                                               // ÓB 加油站
  EV_CHARGING: 'EV_CHARGING',                                       // 电动车充电站
  SUPERMARKET: 'SUPERMARKET',                                       // 超市
  SUPERMARKET_BONUS: 'SUPERMARKET_BONUS',                           // Bonus 超市
  SUPERMARKET_KRONAN: 'SUPERMARKET_KRONAN',                         // Krónan 超市
  SUPERMARKET_HAGKAUP: 'SUPERMARKET_HAGKAUP',                       // Hagkaup 超市
  CONVENIENCE_STORE: 'CONVENIENCE_STORE',                           // 便利店
  
  // ========== 餐饮 (RESTAURANT) ==========
  RESTAURANT: 'RESTAURANT',                                         // 餐厅
  CAFE: 'CAFE',                                                     // 咖啡馆
  FAST_FOOD: 'FAST_FOOD',                                           // 快餐
  BAKERY: 'BAKERY',                                                 // 面包店
  BAR: 'BAR',                                                       // 酒吧
  
  // ========== 住宿 (HOTEL) ==========
  HOTEL: 'HOTEL',                                                   // 酒店
  GUESTHOUSE: 'GUESTHOUSE',                                         // 民宿
  HOSTEL: 'HOSTEL',                                                 // 青年旅舍
  CAMPING: 'CAMPING',                                               // 营地
  CAMPING_EQUIPPED: 'CAMPING_EQUIPPED',                             // 设施营地
  CAMPING_WILD: 'CAMPING_WILD',                                     // 野外营地
  FARM_STAY: 'FARM_STAY',                                           // 农场住宿
  CABIN: 'CABIN',                                                   // 小木屋
  
  // ========== 安全 (SAFETY) ==========
  HOSPITAL: 'HOSPITAL',                                             // 医院
  CLINIC: 'CLINIC',                                                 // 诊所
  PHARMACY: 'PHARMACY',                                             // 药房
  POLICE: 'POLICE',                                                 // 警察局
  FIRE_STATION: 'FIRE_STATION',                                     // 消防站
  RESCUE_HUT: 'RESCUE_HUT',                                         // 救援小屋
  EMERGENCY_SHELTER: 'EMERGENCY_SHELTER',                           // 紧急避难所
  
  // ========== 服务 (SERVICE) ==========
  INFORMATION_CENTER: 'INFORMATION_CENTER',                         // 游客中心
  TOUR_OPERATOR: 'TOUR_OPERATOR',                                   // 旅行社/活动运营商
  CAR_RENTAL: 'CAR_RENTAL',                                         // 租车点
  BANK_ATM: 'BANK_ATM',                                             // 银行/ATM
  POST_OFFICE: 'POST_OFFICE',                                       // 邮局
  WIFI_HOTSPOT: 'WIFI_HOTSPOT',                                     // WiFi 热点
  
  // ========== 基础设施 (INFRASTRUCTURE) ==========
  TOILETS: 'TOILETS',                                               // 公共厕所
  SHOWER: 'SHOWER',                                                 // 淋浴设施
  WATER_POINT: 'WATER_POINT',                                       // 取水点
  PICNIC_AREA: 'PICNIC_AREA',                                       // 野餐区
  
  // ========== 活动体验 (ACTIVITY) ==========
  TRAILHEAD: 'TRAILHEAD',                                           // 徒步起点
  HIKING_TRAIL: 'HIKING_TRAIL',                                     // 徒步路线
  BIKE_TRAIL: 'BIKE_TRAIL',                                         // 自行车道
  SWIMMING_POOL: 'SWIMMING_POOL',                                   // 游泳池
  SPA_POOL: 'SPA_POOL',                                             // 温泉泳池
  HOT_TUB: 'HOT_TUB',                                               // 热水浴池
  WHALE_WATCHING: 'WHALE_WATCHING',                                 // 观鲸点
  PUFFIN_WATCHING: 'PUFFIN_WATCHING',                               // 观海鹦点
  NORTHERN_LIGHTS_TOUR: 'NORTHERN_LIGHTS_TOUR',                     // 极光团
  GLACIER_WALK: 'GLACIER_WALK',                                     // 冰川徒步
  ICE_CAVE: 'ICE_CAVE',                                             // 冰洞探险
  SNOWMOBILE: 'SNOWMOBILE',                                         // 雪地摩托
  HORSE_RIDING: 'HORSE_RIDING',                                     // 骑马
  DIVING_SNORKELING: 'DIVING_SNORKELING',                           // 潜水/浮潜
  KAYAKING: 'KAYAKING',                                             // 皮划艇
  
  // ========== 其他 ==========
  OTHER: 'OTHER',                                                   // 其他
} as const;

export type IcelandCanonicalTypeValue = typeof IcelandCanonicalType[keyof typeof IcelandCanonicalType];

// ============================================
// 三、分类映射关系
// ============================================

/**
 * CanonicalType 到 PlaceCategory 的映射
 */
export const canonicalToCategory: Record<IcelandCanonicalTypeValue, PlaceCategoryExtended> = {
  // 自然景观 -> ATTRACTION
  [IcelandCanonicalType.ATTRACTION_NATURE_VOLCANO]: 'ATTRACTION',
  [IcelandCanonicalType.ATTRACTION_NATURE_LAVA_FIELD]: 'ATTRACTION',
  [IcelandCanonicalType.ATTRACTION_NATURE_CRATER]: 'ATTRACTION',
  [IcelandCanonicalType.ATTRACTION_NATURE_GEOTHERMAL]: 'ATTRACTION',
  [IcelandCanonicalType.ATTRACTION_NATURE_WATERFALL]: 'ATTRACTION',
  [IcelandCanonicalType.ATTRACTION_NATURE_GEYSER]: 'ATTRACTION',
  [IcelandCanonicalType.ATTRACTION_NATURE_HOT_SPRING]: 'ATTRACTION',
  [IcelandCanonicalType.ATTRACTION_NATURE_GLACIER]: 'ATTRACTION',
  [IcelandCanonicalType.ATTRACTION_NATURE_GLACIER_LAGOON]: 'ATTRACTION',
  [IcelandCanonicalType.ATTRACTION_NATURE_FJORD]: 'ATTRACTION',
  [IcelandCanonicalType.ATTRACTION_NATURE_LAKE]: 'ATTRACTION',
  [IcelandCanonicalType.ATTRACTION_NATURE_RIVER]: 'ATTRACTION',
  [IcelandCanonicalType.ATTRACTION_NATURE_BEACH]: 'ATTRACTION',
  [IcelandCanonicalType.ATTRACTION_NATURE_BLACK_BEACH]: 'ATTRACTION',
  [IcelandCanonicalType.ATTRACTION_NATURE_SEA_CLIFF]: 'ATTRACTION',
  [IcelandCanonicalType.ATTRACTION_NATURE_COASTLINE]: 'ATTRACTION',
  [IcelandCanonicalType.ATTRACTION_NATURE_CANYON]: 'ATTRACTION',
  [IcelandCanonicalType.ATTRACTION_NATURE_CAVE]: 'ATTRACTION',
  [IcelandCanonicalType.ATTRACTION_NATURE_MOUNTAIN]: 'ATTRACTION',
  [IcelandCanonicalType.ATTRACTION_NATURE_VALLEY]: 'ATTRACTION',
  [IcelandCanonicalType.ATTRACTION_NATURE_HIGHLAND]: 'ATTRACTION',
  [IcelandCanonicalType.ATTRACTION_NATURE_BIRD_CLIFF]: 'ATTRACTION',
  [IcelandCanonicalType.ATTRACTION_NATURE_SEAL_COLONY]: 'ATTRACTION',
  [IcelandCanonicalType.ATTRACTION_NATURE_WHALE_AREA]: 'ATTRACTION',
  [IcelandCanonicalType.NATIONAL_PARK]: 'ATTRACTION',
  [IcelandCanonicalType.NATURE_RESERVE]: 'ATTRACTION',
  [IcelandCanonicalType.VIEWPOINT]: 'ATTRACTION',
  [IcelandCanonicalType.PHOTO_SPOT]: 'ATTRACTION',
  [IcelandCanonicalType.AURORA_VIEWING]: 'ATTRACTION',
  
  // 人文景观 -> ATTRACTION
  [IcelandCanonicalType.MUSEUM]: 'ATTRACTION',
  [IcelandCanonicalType.CHURCH]: 'ATTRACTION',
  [IcelandCanonicalType.HISTORICAL_SITE]: 'ATTRACTION',
  [IcelandCanonicalType.SCULPTURE]: 'ATTRACTION',
  [IcelandCanonicalType.MONUMENT]: 'ATTRACTION',
  [IcelandCanonicalType.LIGHTHOUSE]: 'ATTRACTION',
  
  // 交通 -> TRANSIT_HUB
  [IcelandCanonicalType.AIRPORT]: 'TRANSIT_HUB',
  [IcelandCanonicalType.AIRPORT_DOMESTIC]: 'TRANSIT_HUB',
  [IcelandCanonicalType.PORT_FERRY_TERMINAL]: 'TRANSIT_HUB',
  [IcelandCanonicalType.PORT_PIER]: 'TRANSIT_HUB',
  [IcelandCanonicalType.BUS_STATION]: 'TRANSIT_HUB',
  [IcelandCanonicalType.PARKING]: 'INFRASTRUCTURE',
  [IcelandCanonicalType.PARKING_FREE]: 'INFRASTRUCTURE',
  [IcelandCanonicalType.PARKING_PAID]: 'INFRASTRUCTURE',
  [IcelandCanonicalType.REST_STOP]: 'INFRASTRUCTURE',
  
  // 补给 -> SUPPLY
  [IcelandCanonicalType.FUEL_STATION]: 'SUPPLY',
  [IcelandCanonicalType.FUEL_N1]: 'SUPPLY',
  [IcelandCanonicalType.FUEL_ORKAN]: 'SUPPLY',
  [IcelandCanonicalType.FUEL_OB]: 'SUPPLY',
  [IcelandCanonicalType.EV_CHARGING]: 'SUPPLY',
  [IcelandCanonicalType.SUPERMARKET]: 'SUPPLY',
  [IcelandCanonicalType.SUPERMARKET_BONUS]: 'SUPPLY',
  [IcelandCanonicalType.SUPERMARKET_KRONAN]: 'SUPPLY',
  [IcelandCanonicalType.SUPERMARKET_HAGKAUP]: 'SUPPLY',
  [IcelandCanonicalType.CONVENIENCE_STORE]: 'SUPPLY',
  
  // 餐饮 -> RESTAURANT
  [IcelandCanonicalType.RESTAURANT]: 'RESTAURANT',
  [IcelandCanonicalType.CAFE]: 'RESTAURANT',
  [IcelandCanonicalType.FAST_FOOD]: 'RESTAURANT',
  [IcelandCanonicalType.BAKERY]: 'RESTAURANT',
  [IcelandCanonicalType.BAR]: 'RESTAURANT',
  
  // 住宿 -> HOTEL
  [IcelandCanonicalType.HOTEL]: 'HOTEL',
  [IcelandCanonicalType.GUESTHOUSE]: 'HOTEL',
  [IcelandCanonicalType.HOSTEL]: 'HOTEL',
  [IcelandCanonicalType.CAMPING]: 'HOTEL',
  [IcelandCanonicalType.CAMPING_EQUIPPED]: 'HOTEL',
  [IcelandCanonicalType.CAMPING_WILD]: 'HOTEL',
  [IcelandCanonicalType.FARM_STAY]: 'HOTEL',
  [IcelandCanonicalType.CABIN]: 'HOTEL',
  
  // 安全 -> SAFETY
  [IcelandCanonicalType.HOSPITAL]: 'SAFETY',
  [IcelandCanonicalType.CLINIC]: 'SAFETY',
  [IcelandCanonicalType.PHARMACY]: 'SAFETY',
  [IcelandCanonicalType.POLICE]: 'SAFETY',
  [IcelandCanonicalType.FIRE_STATION]: 'SAFETY',
  [IcelandCanonicalType.RESCUE_HUT]: 'SAFETY',
  [IcelandCanonicalType.EMERGENCY_SHELTER]: 'SAFETY',
  
  // 服务 -> SERVICE
  [IcelandCanonicalType.INFORMATION_CENTER]: 'SERVICE',
  [IcelandCanonicalType.TOUR_OPERATOR]: 'SERVICE',
  [IcelandCanonicalType.CAR_RENTAL]: 'SERVICE',
  [IcelandCanonicalType.BANK_ATM]: 'SERVICE',
  [IcelandCanonicalType.POST_OFFICE]: 'SERVICE',
  [IcelandCanonicalType.WIFI_HOTSPOT]: 'SERVICE',
  
  // 基础设施 -> INFRASTRUCTURE
  [IcelandCanonicalType.TOILETS]: 'INFRASTRUCTURE',
  [IcelandCanonicalType.SHOWER]: 'INFRASTRUCTURE',
  [IcelandCanonicalType.WATER_POINT]: 'INFRASTRUCTURE',
  [IcelandCanonicalType.PICNIC_AREA]: 'INFRASTRUCTURE',
  
  // 活动 -> ACTIVITY
  [IcelandCanonicalType.TRAILHEAD]: 'ACTIVITY',
  [IcelandCanonicalType.HIKING_TRAIL]: 'ACTIVITY',
  [IcelandCanonicalType.BIKE_TRAIL]: 'ACTIVITY',
  [IcelandCanonicalType.SWIMMING_POOL]: 'ACTIVITY',
  [IcelandCanonicalType.SPA_POOL]: 'ACTIVITY',
  [IcelandCanonicalType.HOT_TUB]: 'ACTIVITY',
  [IcelandCanonicalType.WHALE_WATCHING]: 'ACTIVITY',
  [IcelandCanonicalType.PUFFIN_WATCHING]: 'ACTIVITY',
  [IcelandCanonicalType.NORTHERN_LIGHTS_TOUR]: 'ACTIVITY',
  [IcelandCanonicalType.GLACIER_WALK]: 'ACTIVITY',
  [IcelandCanonicalType.ICE_CAVE]: 'ACTIVITY',
  [IcelandCanonicalType.SNOWMOBILE]: 'ACTIVITY',
  [IcelandCanonicalType.HORSE_RIDING]: 'ACTIVITY',
  [IcelandCanonicalType.DIVING_SNORKELING]: 'ACTIVITY',
  [IcelandCanonicalType.KAYAKING]: 'ACTIVITY',
  
  [IcelandCanonicalType.OTHER]: 'ATTRACTION',
};

// ============================================
// 四、活动类型推断映射
// ============================================

/**
 * 从 CanonicalType 推断用户活动类型
 * 用于 Readiness 模块判断需要触发哪些能力包
 */
export const canonicalToActivities: Record<IcelandCanonicalTypeValue, string[]> = {
  // 自然景观通常涉及的活动
  [IcelandCanonicalType.ATTRACTION_NATURE_VOLCANO]: ['hiking', 'photography'],
  [IcelandCanonicalType.ATTRACTION_NATURE_GLACIER]: ['glacier_walking', 'ice_climbing'],
  [IcelandCanonicalType.ATTRACTION_NATURE_HOT_SPRING]: ['hot_spring', 'swimming'],
  [IcelandCanonicalType.ATTRACTION_NATURE_WATERFALL]: ['hiking', 'photography'],
  [IcelandCanonicalType.ATTRACTION_NATURE_CANYON]: ['hiking', 'photography'],
  [IcelandCanonicalType.ATTRACTION_NATURE_CAVE]: ['caving', 'guided_tour'],
  [IcelandCanonicalType.ATTRACTION_NATURE_BLACK_BEACH]: ['photography', 'walking'],
  [IcelandCanonicalType.ATTRACTION_NATURE_HIGHLAND]: ['hiking', '4x4_driving'],
  
  // 活动类型
  [IcelandCanonicalType.TRAILHEAD]: ['hiking'],
  [IcelandCanonicalType.GLACIER_WALK]: ['glacier_walking'],
  [IcelandCanonicalType.ICE_CAVE]: ['ice_cave_tour'],
  [IcelandCanonicalType.WHALE_WATCHING]: ['whale_watching', 'boat_tour'],
  [IcelandCanonicalType.SNOWMOBILE]: ['snowmobile'],
  [IcelandCanonicalType.HORSE_RIDING]: ['horse_riding'],
  [IcelandCanonicalType.DIVING_SNORKELING]: ['diving', 'snorkeling'],
  [IcelandCanonicalType.KAYAKING]: ['kayaking'],
  [IcelandCanonicalType.NORTHERN_LIGHTS_TOUR]: ['aurora_viewing'],
  [IcelandCanonicalType.AURORA_VIEWING]: ['aurora_viewing'],
  
  // 租车点暗示自驾
  [IcelandCanonicalType.CAR_RENTAL]: ['self_drive'],
  
  // 其他类型返回空数组
  [IcelandCanonicalType.ATTRACTION_NATURE_LAVA_FIELD]: ['hiking', 'photography'],
  [IcelandCanonicalType.ATTRACTION_NATURE_CRATER]: ['hiking'],
  [IcelandCanonicalType.ATTRACTION_NATURE_GEOTHERMAL]: ['photography'],
  [IcelandCanonicalType.ATTRACTION_NATURE_GEYSER]: ['photography'],
  [IcelandCanonicalType.ATTRACTION_NATURE_GLACIER_LAGOON]: ['boat_tour', 'photography'],
  [IcelandCanonicalType.ATTRACTION_NATURE_FJORD]: ['boat_tour', 'photography'],
  [IcelandCanonicalType.ATTRACTION_NATURE_LAKE]: ['photography'],
  [IcelandCanonicalType.ATTRACTION_NATURE_RIVER]: ['kayaking', 'fishing'],
  [IcelandCanonicalType.ATTRACTION_NATURE_BEACH]: ['walking', 'photography'],
  [IcelandCanonicalType.ATTRACTION_NATURE_SEA_CLIFF]: ['photography', 'bird_watching'],
  [IcelandCanonicalType.ATTRACTION_NATURE_COASTLINE]: ['walking', 'photography'],
  [IcelandCanonicalType.ATTRACTION_NATURE_MOUNTAIN]: ['hiking', 'climbing'],
  [IcelandCanonicalType.ATTRACTION_NATURE_VALLEY]: ['hiking'],
  [IcelandCanonicalType.ATTRACTION_NATURE_BIRD_CLIFF]: ['bird_watching', 'photography'],
  [IcelandCanonicalType.ATTRACTION_NATURE_SEAL_COLONY]: ['wildlife_watching'],
  [IcelandCanonicalType.ATTRACTION_NATURE_WHALE_AREA]: ['whale_watching'],
  [IcelandCanonicalType.NATIONAL_PARK]: ['hiking', 'photography'],
  [IcelandCanonicalType.NATURE_RESERVE]: ['hiking', 'photography'],
  [IcelandCanonicalType.VIEWPOINT]: ['photography'],
  [IcelandCanonicalType.PHOTO_SPOT]: ['photography'],
  [IcelandCanonicalType.MUSEUM]: ['sightseeing'],
  [IcelandCanonicalType.CHURCH]: ['sightseeing'],
  [IcelandCanonicalType.HISTORICAL_SITE]: ['sightseeing'],
  [IcelandCanonicalType.SCULPTURE]: ['sightseeing'],
  [IcelandCanonicalType.MONUMENT]: ['sightseeing'],
  [IcelandCanonicalType.LIGHTHOUSE]: ['sightseeing', 'photography'],
  [IcelandCanonicalType.HIKING_TRAIL]: ['hiking'],
  [IcelandCanonicalType.BIKE_TRAIL]: ['biking'],
  [IcelandCanonicalType.SWIMMING_POOL]: ['swimming'],
  [IcelandCanonicalType.SPA_POOL]: ['hot_spring', 'swimming'],
  [IcelandCanonicalType.HOT_TUB]: ['hot_spring'],
  [IcelandCanonicalType.PUFFIN_WATCHING]: ['bird_watching'],
  
  // 以下类型不直接关联活动
  [IcelandCanonicalType.AIRPORT]: [],
  [IcelandCanonicalType.AIRPORT_DOMESTIC]: [],
  [IcelandCanonicalType.PORT_FERRY_TERMINAL]: [],
  [IcelandCanonicalType.PORT_PIER]: [],
  [IcelandCanonicalType.BUS_STATION]: [],
  [IcelandCanonicalType.PARKING]: [],
  [IcelandCanonicalType.PARKING_FREE]: [],
  [IcelandCanonicalType.PARKING_PAID]: [],
  [IcelandCanonicalType.REST_STOP]: [],
  [IcelandCanonicalType.FUEL_STATION]: [],
  [IcelandCanonicalType.FUEL_N1]: [],
  [IcelandCanonicalType.FUEL_ORKAN]: [],
  [IcelandCanonicalType.FUEL_OB]: [],
  [IcelandCanonicalType.EV_CHARGING]: [],
  [IcelandCanonicalType.SUPERMARKET]: [],
  [IcelandCanonicalType.SUPERMARKET_BONUS]: [],
  [IcelandCanonicalType.SUPERMARKET_KRONAN]: [],
  [IcelandCanonicalType.SUPERMARKET_HAGKAUP]: [],
  [IcelandCanonicalType.CONVENIENCE_STORE]: [],
  [IcelandCanonicalType.RESTAURANT]: [],
  [IcelandCanonicalType.CAFE]: [],
  [IcelandCanonicalType.FAST_FOOD]: [],
  [IcelandCanonicalType.BAKERY]: [],
  [IcelandCanonicalType.BAR]: [],
  [IcelandCanonicalType.HOTEL]: [],
  [IcelandCanonicalType.GUESTHOUSE]: [],
  [IcelandCanonicalType.HOSTEL]: [],
  [IcelandCanonicalType.CAMPING]: ['camping'],
  [IcelandCanonicalType.CAMPING_EQUIPPED]: ['camping'],
  [IcelandCanonicalType.CAMPING_WILD]: ['camping'],
  [IcelandCanonicalType.FARM_STAY]: [],
  [IcelandCanonicalType.CABIN]: [],
  [IcelandCanonicalType.HOSPITAL]: [],
  [IcelandCanonicalType.CLINIC]: [],
  [IcelandCanonicalType.PHARMACY]: [],
  [IcelandCanonicalType.POLICE]: [],
  [IcelandCanonicalType.FIRE_STATION]: [],
  [IcelandCanonicalType.RESCUE_HUT]: [],
  [IcelandCanonicalType.EMERGENCY_SHELTER]: [],
  [IcelandCanonicalType.INFORMATION_CENTER]: [],
  [IcelandCanonicalType.TOUR_OPERATOR]: [],
  [IcelandCanonicalType.BANK_ATM]: [],
  [IcelandCanonicalType.POST_OFFICE]: [],
  [IcelandCanonicalType.WIFI_HOTSPOT]: [],
  [IcelandCanonicalType.TOILETS]: [],
  [IcelandCanonicalType.SHOWER]: [],
  [IcelandCanonicalType.WATER_POINT]: [],
  [IcelandCanonicalType.PICNIC_AREA]: [],
  [IcelandCanonicalType.OTHER]: [],
};

// ============================================
// 五、中文显示名映射
// ============================================

export const canonicalTypeDisplayNames: Record<IcelandCanonicalTypeValue, { zh: string; en: string }> = {
  [IcelandCanonicalType.ATTRACTION_NATURE_VOLCANO]: { zh: '火山', en: 'Volcano' },
  [IcelandCanonicalType.ATTRACTION_NATURE_LAVA_FIELD]: { zh: '熔岩区', en: 'Lava Field' },
  [IcelandCanonicalType.ATTRACTION_NATURE_CRATER]: { zh: '火山口', en: 'Crater' },
  [IcelandCanonicalType.ATTRACTION_NATURE_GEOTHERMAL]: { zh: '地热区', en: 'Geothermal Area' },
  [IcelandCanonicalType.ATTRACTION_NATURE_WATERFALL]: { zh: '瀑布', en: 'Waterfall' },
  [IcelandCanonicalType.ATTRACTION_NATURE_GEYSER]: { zh: '间歇泉', en: 'Geyser' },
  [IcelandCanonicalType.ATTRACTION_NATURE_HOT_SPRING]: { zh: '温泉', en: 'Hot Spring' },
  [IcelandCanonicalType.ATTRACTION_NATURE_GLACIER]: { zh: '冰川', en: 'Glacier' },
  [IcelandCanonicalType.ATTRACTION_NATURE_GLACIER_LAGOON]: { zh: '冰川湖', en: 'Glacier Lagoon' },
  [IcelandCanonicalType.ATTRACTION_NATURE_FJORD]: { zh: '峡湾', en: 'Fjord' },
  [IcelandCanonicalType.ATTRACTION_NATURE_LAKE]: { zh: '湖泊', en: 'Lake' },
  [IcelandCanonicalType.ATTRACTION_NATURE_RIVER]: { zh: '河流', en: 'River' },
  [IcelandCanonicalType.ATTRACTION_NATURE_BEACH]: { zh: '海滩', en: 'Beach' },
  [IcelandCanonicalType.ATTRACTION_NATURE_BLACK_BEACH]: { zh: '黑沙滩', en: 'Black Sand Beach' },
  [IcelandCanonicalType.ATTRACTION_NATURE_SEA_CLIFF]: { zh: '海蚀崖', en: 'Sea Cliff' },
  [IcelandCanonicalType.ATTRACTION_NATURE_COASTLINE]: { zh: '海岸线', en: 'Coastline' },
  [IcelandCanonicalType.ATTRACTION_NATURE_CANYON]: { zh: '峡谷', en: 'Canyon' },
  [IcelandCanonicalType.ATTRACTION_NATURE_CAVE]: { zh: '洞穴', en: 'Cave' },
  [IcelandCanonicalType.ATTRACTION_NATURE_MOUNTAIN]: { zh: '山峰', en: 'Mountain' },
  [IcelandCanonicalType.ATTRACTION_NATURE_VALLEY]: { zh: '山谷', en: 'Valley' },
  [IcelandCanonicalType.ATTRACTION_NATURE_HIGHLAND]: { zh: '高地', en: 'Highland' },
  [IcelandCanonicalType.ATTRACTION_NATURE_BIRD_CLIFF]: { zh: '鸟崖', en: 'Bird Cliff' },
  [IcelandCanonicalType.ATTRACTION_NATURE_SEAL_COLONY]: { zh: '海豹栖息地', en: 'Seal Colony' },
  [IcelandCanonicalType.ATTRACTION_NATURE_WHALE_AREA]: { zh: '鲸鱼活动区', en: 'Whale Area' },
  [IcelandCanonicalType.NATIONAL_PARK]: { zh: '国家公园', en: 'National Park' },
  [IcelandCanonicalType.NATURE_RESERVE]: { zh: '自然保护区', en: 'Nature Reserve' },
  [IcelandCanonicalType.VIEWPOINT]: { zh: '观景台', en: 'Viewpoint' },
  [IcelandCanonicalType.PHOTO_SPOT]: { zh: '摄影点', en: 'Photo Spot' },
  [IcelandCanonicalType.AURORA_VIEWING]: { zh: '极光观测点', en: 'Aurora Viewing' },
  [IcelandCanonicalType.MUSEUM]: { zh: '博物馆', en: 'Museum' },
  [IcelandCanonicalType.CHURCH]: { zh: '教堂', en: 'Church' },
  [IcelandCanonicalType.HISTORICAL_SITE]: { zh: '历史遗迹', en: 'Historical Site' },
  [IcelandCanonicalType.SCULPTURE]: { zh: '雕塑', en: 'Sculpture' },
  [IcelandCanonicalType.MONUMENT]: { zh: '纪念碑', en: 'Monument' },
  [IcelandCanonicalType.LIGHTHOUSE]: { zh: '灯塔', en: 'Lighthouse' },
  [IcelandCanonicalType.AIRPORT]: { zh: '机场', en: 'Airport' },
  [IcelandCanonicalType.AIRPORT_DOMESTIC]: { zh: '国内机场', en: 'Domestic Airport' },
  [IcelandCanonicalType.PORT_FERRY_TERMINAL]: { zh: '渡轮码头', en: 'Ferry Terminal' },
  [IcelandCanonicalType.PORT_PIER]: { zh: '码头', en: 'Pier' },
  [IcelandCanonicalType.BUS_STATION]: { zh: '巴士站', en: 'Bus Station' },
  [IcelandCanonicalType.PARKING]: { zh: '停车场', en: 'Parking' },
  [IcelandCanonicalType.PARKING_FREE]: { zh: '免费停车场', en: 'Free Parking' },
  [IcelandCanonicalType.PARKING_PAID]: { zh: '付费停车场', en: 'Paid Parking' },
  [IcelandCanonicalType.REST_STOP]: { zh: '休息站', en: 'Rest Stop' },
  [IcelandCanonicalType.FUEL_STATION]: { zh: '加油站', en: 'Fuel Station' },
  [IcelandCanonicalType.FUEL_N1]: { zh: 'N1 加油站', en: 'N1 Fuel Station' },
  [IcelandCanonicalType.FUEL_ORKAN]: { zh: 'Orkan 加油站', en: 'Orkan Fuel Station' },
  [IcelandCanonicalType.FUEL_OB]: { zh: 'ÓB 加油站', en: 'ÓB Fuel Station' },
  [IcelandCanonicalType.EV_CHARGING]: { zh: '电动车充电站', en: 'EV Charging Station' },
  [IcelandCanonicalType.SUPERMARKET]: { zh: '超市', en: 'Supermarket' },
  [IcelandCanonicalType.SUPERMARKET_BONUS]: { zh: 'Bonus 超市', en: 'Bonus Supermarket' },
  [IcelandCanonicalType.SUPERMARKET_KRONAN]: { zh: 'Krónan 超市', en: 'Krónan Supermarket' },
  [IcelandCanonicalType.SUPERMARKET_HAGKAUP]: { zh: 'Hagkaup 超市', en: 'Hagkaup Supermarket' },
  [IcelandCanonicalType.CONVENIENCE_STORE]: { zh: '便利店', en: 'Convenience Store' },
  [IcelandCanonicalType.RESTAURANT]: { zh: '餐厅', en: 'Restaurant' },
  [IcelandCanonicalType.CAFE]: { zh: '咖啡馆', en: 'Café' },
  [IcelandCanonicalType.FAST_FOOD]: { zh: '快餐', en: 'Fast Food' },
  [IcelandCanonicalType.BAKERY]: { zh: '面包店', en: 'Bakery' },
  [IcelandCanonicalType.BAR]: { zh: '酒吧', en: 'Bar' },
  [IcelandCanonicalType.HOTEL]: { zh: '酒店', en: 'Hotel' },
  [IcelandCanonicalType.GUESTHOUSE]: { zh: '民宿', en: 'Guesthouse' },
  [IcelandCanonicalType.HOSTEL]: { zh: '青年旅舍', en: 'Hostel' },
  [IcelandCanonicalType.CAMPING]: { zh: '营地', en: 'Camping' },
  [IcelandCanonicalType.CAMPING_EQUIPPED]: { zh: '设施营地', en: 'Equipped Camping' },
  [IcelandCanonicalType.CAMPING_WILD]: { zh: '野外营地', en: 'Wild Camping' },
  [IcelandCanonicalType.FARM_STAY]: { zh: '农场住宿', en: 'Farm Stay' },
  [IcelandCanonicalType.CABIN]: { zh: '小木屋', en: 'Cabin' },
  [IcelandCanonicalType.HOSPITAL]: { zh: '医院', en: 'Hospital' },
  [IcelandCanonicalType.CLINIC]: { zh: '诊所', en: 'Clinic' },
  [IcelandCanonicalType.PHARMACY]: { zh: '药房', en: 'Pharmacy' },
  [IcelandCanonicalType.POLICE]: { zh: '警察局', en: 'Police Station' },
  [IcelandCanonicalType.FIRE_STATION]: { zh: '消防站', en: 'Fire Station' },
  [IcelandCanonicalType.RESCUE_HUT]: { zh: '救援小屋', en: 'Rescue Hut' },
  [IcelandCanonicalType.EMERGENCY_SHELTER]: { zh: '紧急避难所', en: 'Emergency Shelter' },
  [IcelandCanonicalType.INFORMATION_CENTER]: { zh: '游客中心', en: 'Information Center' },
  [IcelandCanonicalType.TOUR_OPERATOR]: { zh: '旅行社', en: 'Tour Operator' },
  [IcelandCanonicalType.CAR_RENTAL]: { zh: '租车点', en: 'Car Rental' },
  [IcelandCanonicalType.BANK_ATM]: { zh: '银行/ATM', en: 'Bank/ATM' },
  [IcelandCanonicalType.POST_OFFICE]: { zh: '邮局', en: 'Post Office' },
  [IcelandCanonicalType.WIFI_HOTSPOT]: { zh: 'WiFi 热点', en: 'WiFi Hotspot' },
  [IcelandCanonicalType.TOILETS]: { zh: '公共厕所', en: 'Public Toilets' },
  [IcelandCanonicalType.SHOWER]: { zh: '淋浴设施', en: 'Shower' },
  [IcelandCanonicalType.WATER_POINT]: { zh: '取水点', en: 'Water Point' },
  [IcelandCanonicalType.PICNIC_AREA]: { zh: '野餐区', en: 'Picnic Area' },
  [IcelandCanonicalType.TRAILHEAD]: { zh: '徒步起点', en: 'Trailhead' },
  [IcelandCanonicalType.HIKING_TRAIL]: { zh: '徒步路线', en: 'Hiking Trail' },
  [IcelandCanonicalType.BIKE_TRAIL]: { zh: '自行车道', en: 'Bike Trail' },
  [IcelandCanonicalType.SWIMMING_POOL]: { zh: '游泳池', en: 'Swimming Pool' },
  [IcelandCanonicalType.SPA_POOL]: { zh: '温泉泳池', en: 'Spa Pool' },
  [IcelandCanonicalType.HOT_TUB]: { zh: '热水浴池', en: 'Hot Tub' },
  [IcelandCanonicalType.WHALE_WATCHING]: { zh: '观鲸点', en: 'Whale Watching' },
  [IcelandCanonicalType.PUFFIN_WATCHING]: { zh: '观海鹦点', en: 'Puffin Watching' },
  [IcelandCanonicalType.NORTHERN_LIGHTS_TOUR]: { zh: '极光团', en: 'Northern Lights Tour' },
  [IcelandCanonicalType.GLACIER_WALK]: { zh: '冰川徒步', en: 'Glacier Walk' },
  [IcelandCanonicalType.ICE_CAVE]: { zh: '冰洞探险', en: 'Ice Cave' },
  [IcelandCanonicalType.SNOWMOBILE]: { zh: '雪地摩托', en: 'Snowmobile' },
  [IcelandCanonicalType.HORSE_RIDING]: { zh: '骑马', en: 'Horse Riding' },
  [IcelandCanonicalType.DIVING_SNORKELING]: { zh: '潜水/浮潜', en: 'Diving/Snorkeling' },
  [IcelandCanonicalType.KAYAKING]: { zh: '皮划艇', en: 'Kayaking' },
  [IcelandCanonicalType.OTHER]: { zh: '其他', en: 'Other' },
};
