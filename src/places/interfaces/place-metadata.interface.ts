// src/places/interfaces/place-metadata.interface.ts
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
  };

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
}

