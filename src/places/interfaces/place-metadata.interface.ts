// src/places/interfaces/place-metadata.interface.ts
import type { ExperienceVector } from './experience-vector.interface';

export interface PlaceMetadata {
  // ⏰ 营业时间 (结构化，方便前端展示或逻辑判断)
  openingHours?: {
    weekday?: string; // e.g., "09:00 - 18:00"
    weekend?: string;
    lastEntry?: string; // e.g., "17:30"
    isOpenNow?: boolean; // 抓取时的状态
    // 或者按星期几存储
    mon?: string;
    tue?: string;
    wed?: string;
    thu?: string;
    fri?: string;
    sat?: string;
    sun?: string;
    // OSM opening_hours 格式（原始字符串，如 "Mo-Fr 09:00-18:00"）
    osmFormat?: string;
  };

  // 🟢 营业状态（用于前端显示红黄绿）
  business_status?: 'OPERATIONAL' | 'CLOSED_TEMPORARILY' | 'CLOSED_PERMANENTLY' | 'UNKNOWN';

  // 📞 联系方式
  contact?: {
    website?: string;
    phone?: string;
    instagram?: string;
  };

  // 🛠️ 服务设施 (使用布尔值或标签数组)
  facilities?: {
    wheelchair?: {
      accessible: boolean;
      hasElevator?: boolean;
      hasRestroom?: boolean;
    };
    payment?: string[]; // e.g., ["Visa", "Alipay", "Cash Only"]
    children?: {
      strollerAccessible?: boolean; // 婴儿车
      highChair?: boolean;          // 儿童椅
    };
    parking?: {
      hasParking?: boolean;
      isFree?: boolean;
    };
    // 徒步/户外相关设施（主要用于尼泊尔等徒步目的地）
    internet?: {
      available: boolean;
      type?: 'wlan' | 'wired' | 'none'; // WiFi类型
    };
    drinkingWater?: boolean; // 饮用水
    toilets?: boolean; // 厕所
  };
  
  // 💡 抓取源的原始标签 (作为备份)
  rawTags?: string[];
  
  // 时区信息
  timezone?: string; // e.g., "Asia/Tokyo"
  
  // 最后抓取时间
  lastCrawledAt?: string | Date;
  
  /** 酒店位置评分（仅当 category = HOTEL 时） */
  location_score?: {
    center_distance_km?: number;
    nearest_station_walk_min?: number;
    is_transport_hub?: boolean;
    avg_distance_to_attractions_km?: number;
    transport_convenience_score?: number;
  };
  
  /** 酒店星级（仅当 category = HOTEL 时） */
  hotel_tier?: number;

  // 🥾 徒步路线关联（快招3：强绑定 Trail 数据）
  /** 关联的 Trail ID（用于徒步类 POI） */
  trailId?: number;
  /** 关联的路由 ID（外部系统，如 AllTrails/Komoot） */
  routeId?: string;
  /** 路由数据源（alltrails, komoot, internal） */
  routeSource?: 'alltrails' | 'komoot' | 'internal';

  // ⏱️ 游玩时长数据源（快招2：数据源优先）
  /** 官方建议停留时长（分钟）- 最高优先级 */
  officialDurationMin?: number;
  /** Google Popular Times 推断的典型停留时长（分钟） */
  googlePopularTimesDurationMin?: number;
  /** 同类 POI 统计中位数（分钟）- 按 category + subCategory + country 计算 */
  medianDurationBySimilarPoi?: number;

  /** Travel World Model: 体验向量 (culture/nature/food/...) 权重 0-1 */
  experienceVector?: ExperienceVector;

  /** Travel World Model: 用于节奏控制，如 MUSEUM、TEMPLE */
  canonicalType?: string;
}

