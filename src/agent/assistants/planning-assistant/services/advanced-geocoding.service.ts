// src/agent/assistants/planning-assistant/services/advanced-geocoding.service.ts

/**
 * Advanced Geocoding Service
 * 
 * 高级地理编码服务 - 地理科学家的视角
 * 
 * 功能：
 * 1. 智能位置名称解析和标准化
 * 2. 模糊匹配和相似度计算
 * 3. 地标和POI识别
 * 4. 相对位置理解（如"冰岛首都"、"东京市中心"）
 * 5. 上下文感知（如"附近的"、"在...附近"）
 * 6. 多层级地理编码（国家→省份→城市→区县→街道→地标）
 * 7. 坐标验证和标准化
 * 8. 时区和地理信息提取
 * 9. 批量地理编码
 * 10. 智能缓存策略
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { GoogleMapsDirectService } from '../../../../mcp/google-maps-direct.service';
import { GeographicDataValidatorService } from '../../../../data-quality/services/geographic-data-validator.service';

export interface GeocodingResult {
  normalizedName: string;
  coordinates?: { lat: number; lng: number };
  address?: string;
  city?: string;
  country?: string;
  countryCode?: string;
  timezone?: string;
  confidence: number;
  source: 'mapping' | 'cache' | 'geocoding' | 'fuzzy_match';
  metadata?: {
    administrativeLevels?: Record<string, string>;
    formattedAddress?: string;
    placeId?: string;
    types?: string[];
  };
}

export interface LocationContext {
  selectedDestination?: string;
  currentLocation?: { lat: number; lng: number };
  language?: string;
  region?: string;
}

/**
 * 坐标精度监控指标
 */
export interface GeocodingMetrics {
  // 总体统计
  totalGeocodingRequests: number;
  successfulGeocodingRequests: number;
  failedGeocodingRequests: number;
  
  // 坐标来源分布
  sourceDistribution: {
    mapping: number;        // 预定义地标
    cache: number;          // 缓存
    geocoding: number;     // Google Maps API
    fuzzy_match: number;   // 模糊匹配
  };
  
  // 置信度分布
  confidenceDistribution: {
    high: number;    // >= 0.9
    medium: number;  // 0.7-0.9
    low: number;     // < 0.7
  };
  
  // 坐标精度统计
  coordinatePrecision: {
    withCoordinates: number;      // 有坐标的结果数
    withoutCoordinates: number;    // 无坐标的结果数
    avgDecimalPlaces: number;      // 平均小数位数
  };
  
  // 性能指标
  performance: {
    avgLatency: number;           // 平均延迟（ms）
    p50Latency: number;           // P50延迟
    p95Latency: number;           // P95延迟
    p99Latency: number;           // P99延迟
  };
  
  // 验证结果统计
  validation: {
    validatedCoordinates: number;      // 通过验证的坐标数
    invalidCoordinates: number;       // 无效坐标数
    spatialRangeValidations: number;  // 空间范围验证次数
    spatialRangeWarnings: number;     // 空间范围警告数
  };
  
  // 批量处理统计
  batchProcessing: {
    totalBatches: number;
    totalBatchItems: number;
    batchErrors: number;
    avgBatchSize: number;
  };
}

@Injectable()
export class AdvancedGeocodingService {
  private readonly logger = new Logger(AdvancedGeocodingService.name);

  // 地标和POI映射（常见旅游地标）- 包含预定义精确坐标
  private readonly landmarkMap: Map<string, { name: string; city: string; country: string; coordinates?: { lat: number; lng: number } }> = new Map([
    // 中国地标（预定义精确坐标）
    ['天安门', { name: 'Tiananmen Square', city: 'Beijing', country: 'China', coordinates: { lat: 39.9042, lng: 116.3974 } }],
    ['故宫', { name: 'Forbidden City', city: 'Beijing', country: 'China', coordinates: { lat: 39.9163, lng: 116.3972 } }],
    ['长城', { name: 'Great Wall of China', city: 'Beijing', country: 'China', coordinates: { lat: 40.4319, lng: 116.5704 } }], // 八达岭长城
    ['外滩', { name: 'The Bund', city: 'Shanghai', country: 'China', coordinates: { lat: 31.2397, lng: 121.4994 } }],
    ['东方明珠', { name: 'Oriental Pearl Tower', city: 'Shanghai', country: 'China', coordinates: { lat: 31.2397, lng: 121.4994 } }],
    ['西湖', { name: 'West Lake', city: 'Hangzhou', country: 'China', coordinates: { lat: 30.2741, lng: 120.1551 } }],
    
    // 日本地标（预定义精确坐标）
    ['东京塔', { name: 'Tokyo Tower', city: 'Tokyo', country: 'Japan', coordinates: { lat: 35.6586, lng: 139.7454 } }],
    ['浅草寺', { name: 'Senso-ji Temple', city: 'Tokyo', country: 'Japan', coordinates: { lat: 35.7148, lng: 139.7967 } }],
    ['秋叶原', { name: 'Akihabara', city: 'Tokyo', country: 'Japan', coordinates: { lat: 35.6984, lng: 139.7731 } }],
    ['大阪城', { name: 'Osaka Castle', city: 'Osaka', country: 'Japan', coordinates: { lat: 34.6873, lng: 135.5262 } }],
    ['清水寺', { name: 'Kiyomizu-dera Temple', city: 'Kyoto', country: 'Japan', coordinates: { lat: 34.9949, lng: 135.7850 } }],
    
    // 欧洲地标（预定义精确坐标）
    ['埃菲尔铁塔', { name: 'Eiffel Tower', city: 'Paris', country: 'France', coordinates: { lat: 48.8584, lng: 2.2945 } }],
    ['卢浮宫', { name: 'Louvre Museum', city: 'Paris', country: 'France', coordinates: { lat: 48.8606, lng: 2.3376 } }],
    ['大本钟', { name: 'Big Ben', city: 'London', country: 'United Kingdom', coordinates: { lat: 51.4994, lng: -0.1245 } }],
    ['伦敦塔', { name: 'Tower of London', city: 'London', country: 'United Kingdom', coordinates: { lat: 51.5081, lng: -0.0759 } }],
    ['斗兽场', { name: 'Colosseum', city: 'Rome', country: 'Italy', coordinates: { lat: 41.8902, lng: 12.4922 } }],
    ['圣彼得大教堂', { name: 'St. Peter\'s Basilica', city: 'Vatican City', country: 'Vatican City', coordinates: { lat: 41.9022, lng: 12.4539 } }],
    
    // 冰岛地标（预定义精确坐标）
    ['蓝湖', { name: 'Blue Lagoon', city: 'Reykjavik', country: 'Iceland', coordinates: { lat: 63.8804, lng: -22.4494 } }],
    ['黄金瀑布', { name: 'Gullfoss', city: 'Reykjavik', country: 'Iceland', coordinates: { lat: 64.3261, lng: -20.1200 } }],
    ['间歇泉', { name: 'Geysir', city: 'Reykjavik', country: 'Iceland', coordinates: { lat: 64.3105, lng: -20.3028 } }],
    ['杰古沙龙冰河湖', { name: 'Jökulsárlón', city: 'Reykjavik', country: 'Iceland', coordinates: { lat: 64.0485, lng: -16.1794 } }],
    ['冰河湖', { name: 'Jökulsárlón', city: 'Reykjavik', country: 'Iceland', coordinates: { lat: 64.0485, lng: -16.1794 } }],
    ['黑沙滩', { name: 'Reynisfjara', city: 'Vik', country: 'Iceland', coordinates: { lat: 63.4048, lng: -19.0453 } }],
    ['钻石沙滩', { name: 'Diamond Beach', city: 'Jökulsárlón', country: 'Iceland', coordinates: { lat: 64.0444, lng: -16.1789 } }],
    ['辛格维利尔国家公园', { name: 'Þingvellir National Park', city: 'Reykjavik', country: 'Iceland', coordinates: { lat: 64.2556, lng: -21.1297 } }],
    ['斯科加瀑布', { name: 'Skógafoss', city: 'Vik', country: 'Iceland', coordinates: { lat: 63.5319, lng: -19.5114 } }],
    ['塞里雅兰瀑布', { name: 'Seljalandsfoss', city: 'Vik', country: 'Iceland', coordinates: { lat: 63.6156, lng: -19.9897 } }],
    ['黄金圈', { name: 'Golden Circle', city: 'Reykjavik', country: 'Iceland', coordinates: { lat: 64.2556, lng: -21.1297 } }], // 使用辛格维利尔作为代表点
    ['1号公路', { name: 'Ring Road', city: 'Reykjavik', country: 'Iceland', coordinates: { lat: 64.1466, lng: -21.9426 } }], // 使用雷克雅未克作为代表点
    ['环岛公路', { name: 'Ring Road', city: 'Reykjavik', country: 'Iceland', coordinates: { lat: 64.1466, lng: -21.9426 } }],
    
    // 更多欧洲地标（预定义精确坐标）
    ['比萨斜塔', { name: 'Leaning Tower of Pisa', city: 'Pisa', country: 'Italy', coordinates: { lat: 43.7230, lng: 10.3966 } }],
    ['威尼斯', { name: 'Venice', city: 'Venice', country: 'Italy', coordinates: { lat: 45.4408, lng: 12.3155 } }],
    ['圣马可广场', { name: 'St. Mark\'s Square', city: 'Venice', country: 'Italy', coordinates: { lat: 45.4342, lng: 12.3388 } }],
    ['巴塞罗那圣家堂', { name: 'Sagrada Familia', city: 'Barcelona', country: 'Spain', coordinates: { lat: 41.4036, lng: 2.1744 } }],
    ['圣家堂', { name: 'Sagrada Familia', city: 'Barcelona', country: 'Spain', coordinates: { lat: 41.4036, lng: 2.1744 } }],
    ['阿尔罕布拉宫', { name: 'Alhambra', city: 'Granada', country: 'Spain', coordinates: { lat: 37.1760, lng: -3.5889 } }],
    ['新天鹅堡', { name: 'Neuschwanstein Castle', city: 'Füssen', country: 'Germany', coordinates: { lat: 47.5576, lng: 10.7498 } }],
    ['勃兰登堡门', { name: 'Brandenburg Gate', city: 'Berlin', country: 'Germany', coordinates: { lat: 52.5163, lng: 13.3777 } }],
    ['阿姆斯特丹运河', { name: 'Amsterdam Canals', city: 'Amsterdam', country: 'Netherlands', coordinates: { lat: 52.3676, lng: 4.9041 } }],
    ['风车村', { name: 'Zaanse Schans', city: 'Amsterdam', country: 'Netherlands', coordinates: { lat: 52.4736, lng: 4.8167 } }],
    ['雅典卫城', { name: 'Acropolis', city: 'Athens', country: 'Greece', coordinates: { lat: 37.9715, lng: 23.7268 } }],
    ['圣托里尼', { name: 'Santorini', city: 'Santorini', country: 'Greece', coordinates: { lat: 36.3932, lng: 25.4615 } }],
    
    // 更多亚洲地标（预定义精确坐标）
    ['首尔塔', { name: 'N Seoul Tower', city: 'Seoul', country: 'South Korea', coordinates: { lat: 37.5512, lng: 126.9882 } }],
    ['明洞', { name: 'Myeongdong', city: 'Seoul', country: 'South Korea', coordinates: { lat: 37.5636, lng: 126.9826 } }],
    ['济州岛', { name: 'Jeju Island', city: 'Jeju', country: 'South Korea', coordinates: { lat: 33.4996, lng: 126.5312 } }],
    ['大皇宫', { name: 'Grand Palace', city: 'Bangkok', country: 'Thailand', coordinates: { lat: 13.7500, lng: 100.4926 } }],
    ['吴哥窟', { name: 'Angkor Wat', city: 'Siem Reap', country: 'Cambodia', coordinates: { lat: 13.4125, lng: 103.8670 } }],
    ['鱼尾狮', { name: 'Merlion', city: 'Singapore', country: 'Singapore', coordinates: { lat: 1.2868, lng: 103.8545 } }],
    ['滨海湾', { name: 'Marina Bay', city: 'Singapore', country: 'Singapore', coordinates: { lat: 1.2839, lng: 103.8608 } }],
    ['双子塔', { name: 'Petronas Twin Towers', city: 'Kuala Lumpur', country: 'Malaysia', coordinates: { lat: 3.1579, lng: 101.7116 } }],
    ['巴厘岛', { name: 'Bali', city: 'Denpasar', country: 'Indonesia', coordinates: { lat: -8.3405, lng: 115.0920 } }],
    ['乌布', { name: 'Ubud', city: 'Bali', country: 'Indonesia', coordinates: { lat: -8.5069, lng: 115.2625 } }],
    
    // 北美地标（预定义精确坐标）
    ['自由女神像', { name: 'Statue of Liberty', city: 'New York', country: 'United States', coordinates: { lat: 40.6892, lng: -74.0445 } }],
    ['时代广场', { name: 'Times Square', city: 'New York', country: 'United States', coordinates: { lat: 40.7580, lng: -73.9855 } }],
    ['中央公园', { name: 'Central Park', city: 'New York', country: 'United States', coordinates: { lat: 40.7829, lng: -73.9654 } }],
    ['好莱坞', { name: 'Hollywood', city: 'Los Angeles', country: 'United States', coordinates: { lat: 34.0928, lng: -118.3287 } }],
    ['金门大桥', { name: 'Golden Gate Bridge', city: 'San Francisco', country: 'United States', coordinates: { lat: 37.8199, lng: -122.4783 } }],
    ['尼亚加拉瀑布', { name: 'Niagara Falls', city: 'Niagara Falls', country: 'United States', coordinates: { lat: 43.0962, lng: -79.0377 } }],
    ['大峡谷', { name: 'Grand Canyon', city: 'Grand Canyon', country: 'United States', coordinates: { lat: 36.1069, lng: -112.1129 } }],
    ['黄石公园', { name: 'Yellowstone National Park', city: 'Yellowstone', country: 'United States', coordinates: { lat: 44.4280, lng: -110.5885 } }],
    ['CN塔', { name: 'CN Tower', city: 'Toronto', country: 'Canada', coordinates: { lat: 43.6426, lng: -79.3871 } }],
    ['班夫国家公园', { name: 'Banff National Park', city: 'Banff', country: 'Canada', coordinates: { lat: 51.1784, lng: -115.5708 } }],
    
    // 澳洲/新西兰地标（预定义精确坐标）
    ['悉尼歌剧院', { name: 'Sydney Opera House', city: 'Sydney', country: 'Australia', coordinates: { lat: -33.8568, lng: 151.2153 } }],
    ['悉尼海港大桥', { name: 'Sydney Harbour Bridge', city: 'Sydney', country: 'Australia', coordinates: { lat: -33.8523, lng: 151.2108 } }],
    ['大堡礁', { name: 'Great Barrier Reef', city: 'Cairns', country: 'Australia', coordinates: { lat: -16.2864, lng: 145.4233 } }],
    ['乌鲁鲁', { name: 'Uluru', city: 'Alice Springs', country: 'Australia', coordinates: { lat: -25.3444, lng: 131.0369 } }],
    ['艾尔斯岩', { name: 'Uluru', city: 'Alice Springs', country: 'Australia', coordinates: { lat: -25.3444, lng: 131.0369 } }],
    ['皇后镇', { name: 'Queenstown', city: 'Queenstown', country: 'New Zealand', coordinates: { lat: -45.0312, lng: 168.6626 } }],
    ['米尔福德峡湾', { name: 'Milford Sound', city: 'Queenstown', country: 'New Zealand', coordinates: { lat: -44.6414, lng: 167.8970 } }],
  ]);

  // 相对位置关键词映射
  private readonly relativeLocationMap: Map<string, string> = new Map([
    ['首都', 'capital'],
    ['省会', 'provincial capital'],
    ['市中心', 'city center'],
    ['中心', 'center'],
    ['机场', 'airport'],
    ['火车站', 'train station'],
    ['港口', 'port'],
  ]);

  // 国家首都映射
  private readonly capitalMap: Map<string, string> = new Map([
    // 亚洲
    ['冰岛', 'Reykjavik'],
    ['日本', 'Tokyo'],
    ['中国', 'Beijing'],
    ['韩国', 'Seoul'],
    ['泰国', 'Bangkok'],
    ['新加坡', 'Singapore'],
    ['马来西亚', 'Kuala Lumpur'],
    ['印度尼西亚', 'Jakarta'],
    ['菲律宾', 'Manila'],
    ['越南', 'Hanoi'],
    ['柬埔寨', 'Phnom Penh'],
    ['缅甸', 'Naypyidaw'],
    ['老挝', 'Vientiane'],
    ['印度', 'New Delhi'],
    ['尼泊尔', 'Kathmandu'],
    ['斯里兰卡', 'Colombo'],
    ['马尔代夫', 'Malé'],
    
    // 欧洲
    ['英国', 'London'],
    ['法国', 'Paris'],
    ['德国', 'Berlin'],
    ['意大利', 'Rome'],
    ['西班牙', 'Madrid'],
    ['葡萄牙', 'Lisbon'],
    ['希腊', 'Athens'],
    ['荷兰', 'Amsterdam'],
    ['比利时', 'Brussels'],
    ['瑞士', 'Bern'],
    ['奥地利', 'Vienna'],
    ['瑞典', 'Stockholm'],
    ['挪威', 'Oslo'],
    ['丹麦', 'Copenhagen'],
    ['芬兰', 'Helsinki'],
    ['波兰', 'Warsaw'],
    ['捷克', 'Prague'],
    ['匈牙利', 'Budapest'],
    ['俄罗斯', 'Moscow'],
    ['土耳其', 'Ankara'],
    
    // 北美
    ['美国', 'Washington DC'],
    ['加拿大', 'Ottawa'],
    ['墨西哥', 'Mexico City'],
    
    // 南美
    ['巴西', 'Brasília'],
    ['阿根廷', 'Buenos Aires'],
    ['智利', 'Santiago'],
    ['秘鲁', 'Lima'],
    ['哥伦比亚', 'Bogotá'],
    
    // 澳洲/大洋洲
    ['澳大利亚', 'Canberra'],
    ['新西兰', 'Wellington'],
    
    // 非洲
    ['南非', 'Cape Town'],
    ['埃及', 'Cairo'],
    ['摩洛哥', 'Rabat'],
    ['肯尼亚', 'Nairobi'],
  ]);

  // 时区映射（主要城市）
  private readonly timezoneMap: Map<string, string> = new Map([
    ['Reykjavik', 'Atlantic/Reykjavik'],
    ['Tokyo', 'Asia/Tokyo'],
    ['Beijing', 'Asia/Shanghai'],
    ['Seoul', 'Asia/Seoul'],
    ['Bangkok', 'Asia/Bangkok'],
    ['Singapore', 'Asia/Singapore'],
    ['London', 'Europe/London'],
    ['Paris', 'Europe/Paris'],
    ['Berlin', 'Europe/Berlin'],
    ['Rome', 'Europe/Rome'],
    ['Madrid', 'Europe/Madrid'],
    ['New York', 'America/New_York'],
    ['Los Angeles', 'America/Los_Angeles'],
    ['San Francisco', 'America/Los_Angeles'],
    ['Toronto', 'America/Toronto'],
    ['Vancouver', 'America/Vancouver'],
    ['Sydney', 'Australia/Sydney'],
    ['Melbourne', 'Australia/Melbourne'],
    ['Auckland', 'Pacific/Auckland'],
  ]);

  // 地理编码结果缓存
  private readonly geocodeCache: Map<string, { result: GeocodingResult; timestamp: number }> = new Map();
  private readonly GEOCODE_CACHE_TTL = 24 * 60 * 60 * 1000; // 24小时

  // 国家边界映射（用于空间范围验证）- 扩展至50+个国家
  private readonly countryBounds: Map<string, { minLat: number; maxLat: number; minLng: number; maxLng: number }> = new Map([
    // 亚洲
    ['IS', { minLat: 63.3, maxLat: 66.6, minLng: -24.5, maxLng: -13.5 }], // 冰岛
    ['JP', { minLat: 24.2, maxLat: 45.5, minLng: 123.0, maxLng: 145.8 }], // 日本
    ['CN', { minLat: 18.2, maxLat: 53.6, minLng: 73.5, maxLng: 135.0 }], // 中国
    ['KR', { minLat: 33.1, maxLat: 38.6, minLng: 124.6, maxLng: 131.9 }], // 韩国
    ['TH', { minLat: 5.6, maxLat: 20.5, minLng: 97.3, maxLng: 105.6 }], // 泰国
    ['SG', { minLat: 1.2, maxLat: 1.5, minLng: 103.6, maxLng: 104.0 }], // 新加坡
    ['MY', { minLat: 0.9, maxLat: 7.4, minLng: 99.6, maxLng: 119.3 }], // 马来西亚
    ['ID', { minLat: -11.0, maxLat: 6.1, minLng: 95.0, maxLng: 141.0 }], // 印度尼西亚
    ['PH', { minLat: 4.6, maxLat: 21.1, minLng: 116.9, maxLng: 126.6 }], // 菲律宾
    ['VN', { minLat: 8.6, maxLat: 23.4, minLng: 102.1, maxLng: 109.5 }], // 越南
    ['KH', { minLat: 10.5, maxLat: 14.7, minLng: 102.3, maxLng: 107.6 }], // 柬埔寨
    ['MM', { minLat: 9.8, maxLat: 28.5, minLng: 92.2, maxLng: 101.2 }], // 缅甸
    ['LA', { minLat: 13.9, maxLat: 22.5, minLng: 100.1, maxLng: 107.6 }], // 老挝
    ['IN', { minLat: 6.8, maxLat: 35.7, minLng: 68.2, maxLng: 97.4 }], // 印度
    ['NP', { minLat: 26.4, maxLat: 30.4, minLng: 80.1, maxLng: 88.2 }], // 尼泊尔
    ['LK', { minLat: 5.9, maxLat: 9.8, minLng: 79.7, maxLng: 81.9 }], // 斯里兰卡
    ['MV', { minLat: 3.2, maxLat: 7.1, minLng: 72.7, maxLng: 73.7 }], // 马尔代夫
    ['TW', { minLat: 21.9, maxLat: 25.3, minLng: 119.5, maxLng: 122.0 }], // 台湾
    ['HK', { minLat: 22.2, maxLat: 22.6, minLng: 113.8, maxLng: 114.4 }], // 香港
    ['MO', { minLat: 22.1, maxLat: 22.2, minLng: 113.5, maxLng: 113.6 }], // 澳门
    
    // 欧洲
    ['GB', { minLat: 49.9, maxLat: 60.8, minLng: -8.6, maxLng: 1.8 }], // 英国
    ['FR', { minLat: 41.3, maxLat: 51.1, minLng: -5.1, maxLng: 9.6 }], // 法国
    ['DE', { minLat: 47.3, maxLat: 55.1, minLng: 5.9, maxLng: 15.0 }], // 德国
    ['IT', { minLat: 36.6, maxLat: 47.1, minLng: 6.6, maxLng: 18.5 }], // 意大利
    ['ES', { minLat: 35.2, maxLat: 43.8, minLng: -9.3, maxLng: 4.3 }], // 西班牙
    ['PT', { minLat: 36.8, maxLat: 42.2, minLng: -9.5, maxLng: -6.2 }], // 葡萄牙
    ['GR', { minLat: 34.8, maxLat: 41.7, minLng: 19.4, maxLng: 29.6 }], // 希腊
    ['NL', { minLat: 50.8, maxLat: 53.6, minLng: 3.4, maxLng: 7.2 }], // 荷兰
    ['BE', { minLat: 49.5, maxLat: 51.5, minLng: 2.5, maxLng: 6.4 }], // 比利时
    ['CH', { minLat: 45.8, maxLat: 47.8, minLng: 5.9, maxLng: 10.5 }], // 瑞士
    ['AT', { minLat: 46.4, maxLat: 49.0, minLng: 9.5, maxLng: 17.2 }], // 奥地利
    ['SE', { minLat: 55.3, maxLat: 69.1, minLng: 11.0, maxLng: 24.2 }], // 瑞典
    ['NO', { minLat: 57.9, maxLat: 71.2, minLng: 4.5, maxLng: 31.3 }], // 挪威
    ['DK', { minLat: 54.6, maxLat: 57.7, minLng: 8.1, maxLng: 12.7 }], // 丹麦
    ['FI', { minLat: 60.0, maxLat: 70.1, minLng: 20.6, maxLng: 31.6 }], // 芬兰
    ['PL', { minLat: 49.0, maxLat: 54.8, minLng: 14.1, maxLng: 24.1 }], // 波兰
    ['CZ', { minLat: 48.6, maxLat: 51.1, minLng: 12.1, maxLng: 18.9 }], // 捷克
    ['HU', { minLat: 45.7, maxLat: 48.6, minLng: 16.2, maxLng: 22.9 }], // 匈牙利
    ['RO', { minLat: 43.7, maxLat: 48.2, minLng: 20.2, maxLng: 29.7 }], // 罗马尼亚
    ['RU', { minLat: 41.2, maxLat: 81.9, minLng: 19.6, maxLng: 169.0 }], // 俄罗斯
    ['TR', { minLat: 35.8, maxLat: 42.1, minLng: 25.7, maxLng: 44.8 }], // 土耳其
    ['IE', { minLat: 51.4, maxLat: 55.4, minLng: -10.5, maxLng: -5.9 }], // 爱尔兰
    ['IS', { minLat: 63.3, maxLat: 66.6, minLng: -24.5, maxLng: -13.5 }], // 冰岛（已在亚洲部分，但属于欧洲）
    
    // 北美
    ['US', { minLat: 24.4, maxLat: 49.4, minLng: -125.0, maxLng: -66.9 }], // 美国
    ['CA', { minLat: 41.7, maxLat: 83.1, minLng: -141.0, maxLng: -52.6 }], // 加拿大
    ['MX', { minLat: 14.5, maxLat: 32.7, minLng: -118.4, maxLng: -86.8 }], // 墨西哥
    
    // 南美
    ['BR', { minLat: -33.7, maxLat: 5.3, minLng: -73.9, maxLng: -32.4 }], // 巴西
    ['AR', { minLat: -55.1, maxLat: -21.8, minLng: -73.6, maxLng: -53.6 }], // 阿根廷
    ['CL', { minLat: -56.0, maxLat: -17.5, minLng: -109.5, maxLng: -66.4 }], // 智利
    ['PE', { minLat: -18.3, maxLat: -0.0, minLng: -81.3, maxLng: -68.7 }], // 秘鲁
    ['CO', { minLat: -4.2, maxLat: 12.5, minLng: -79.0, maxLng: -66.9 }], // 哥伦比亚
    ['EC', { minLat: -4.2, maxLat: 1.5, minLng: -81.1, maxLng: -75.2 }], // 厄瓜多尔
    
    // 澳洲/大洋洲
    ['AU', { minLat: -43.6, maxLat: -10.7, minLng: 113.3, maxLng: 153.6 }], // 澳大利亚
    ['NZ', { minLat: -47.3, maxLat: -34.4, minLng: 166.4, maxLng: 178.5 }], // 新西兰
    ['FJ', { minLat: -20.7, maxLat: -12.5, minLng: 177.0, maxLng: 180.0 }], // 斐济
    ['PG', { minLat: -12.0, maxLat: -0.3, minLng: 140.8, maxLng: 159.9 }], // 巴布亚新几内亚
    
    // 非洲
    ['ZA', { minLat: -34.8, maxLat: -22.1, minLng: 16.5, maxLng: 32.8 }], // 南非
    ['EG', { minLat: 22.0, maxLat: 31.7, minLng: 24.7, maxLng: 36.9 }], // 埃及
    ['MA', { minLat: 21.4, maxLat: 35.9, minLng: -17.0, maxLng: -1.1 }], // 摩洛哥
    ['KE', { minLat: -4.7, maxLat: 5.5, minLng: 33.9, maxLng: 41.9 }], // 肯尼亚
    ['TZ', { minLat: -11.8, maxLat: -0.9, minLng: 29.3, maxLng: 40.3 }], // 坦桑尼亚
    ['ET', { minLat: 3.4, maxLat: 14.9, minLng: 32.9, maxLng: 47.9 }], // 埃塞俄比亚
    
    // 中东
    ['AE', { minLat: 22.6, maxLat: 26.1, minLng: 51.0, maxLng: 56.4 }], // 阿联酋
    ['SA', { minLat: 16.0, maxLat: 32.2, minLng: 34.5, maxLng: 55.7 }], // 沙特阿拉伯
    ['IL', { minLat: 29.5, maxLat: 33.3, minLng: 34.3, maxLng: 35.8 }], // 以色列
    ['JO', { minLat: 29.2, maxLat: 33.4, minLng: 34.9, maxLng: 39.3 }], // 约旦
    
    // 其他
    ['GL', { minLat: 59.8, maxLat: 83.6, minLng: -73.0, maxLng: -12.2 }], // 格陵兰
    ['FO', { minLat: 61.4, maxLat: 62.4, minLng: -7.7, maxLng: -6.3 }], // 法罗群岛
    ['SJ', { minLat: 74.0, maxLat: 81.0, minLng: 10.0, maxLng: 35.0 }], // 斯瓦尔巴
    ['VA', { minLat: 41.9, maxLat: 41.9, minLng: 12.4, maxLng: 12.5 }], // 梵蒂冈
  ]);

  // 监控指标
  private readonly metrics: GeocodingMetrics = {
    totalGeocodingRequests: 0,
    successfulGeocodingRequests: 0,
    failedGeocodingRequests: 0,
    sourceDistribution: {
      mapping: 0,
      cache: 0,
      geocoding: 0,
      fuzzy_match: 0,
    },
    confidenceDistribution: {
      high: 0,
      medium: 0,
      low: 0,
    },
    coordinatePrecision: {
      withCoordinates: 0,
      withoutCoordinates: 0,
      avgDecimalPlaces: 0,
    },
    performance: {
      avgLatency: 0,
      p50Latency: 0,
      p95Latency: 0,
      p99Latency: 0,
    },
    validation: {
      validatedCoordinates: 0,
      invalidCoordinates: 0,
      spatialRangeValidations: 0,
      spatialRangeWarnings: 0,
    },
    batchProcessing: {
      totalBatches: 0,
      totalBatchItems: 0,
      batchErrors: 0,
      avgBatchSize: 0,
    },
  };

  // 性能数据存储（用于计算百分位数）
  private readonly latencies: number[] = [];
  private readonly decimalPlaces: number[] = [];
  private readonly MAX_SAMPLES = 1000; // 最大样本数

  constructor(
    @Optional() private readonly googleMapsDirectService?: GoogleMapsDirectService,
    @Optional() private readonly geographicDataValidator?: GeographicDataValidatorService,
  ) {
    this.logger.log('🚀 Advanced Geocoding Service 初始化');
    this.logger.log(`Google Maps 服务: ${googleMapsDirectService ? '可用' : '不可用'}`);
    this.logger.log(`地理数据验证器: ${geographicDataValidator ? '可用' : '不可用'}`);
  }

  /**
   * 高级地理编码 - 主入口
   */
  async geocode(
    location: string,
    context?: LocationContext
  ): Promise<GeocodingResult> {
    const startTime = Date.now();
    this.metrics.totalGeocodingRequests++;

    try {
      if (!location || typeof location !== 'string') {
        throw new Error('位置名称不能为空');
      }

      const cleanedLocation = this.cleanLocationName(location);
      this.logger.debug(`开始地理编码: "${location}" -> "${cleanedLocation}"`);

      // 1. 检查缓存
      const cachedResult = this.geocodeCache.get(cleanedLocation);
      if (cachedResult && Date.now() - cachedResult.timestamp < this.GEOCODE_CACHE_TTL) {
        this.logger.debug(`使用缓存结果: "${cleanedLocation}"`);
        const latency = Date.now() - startTime;
        this.recordMetrics(cachedResult.result, latency, 'cache');
        return cachedResult.result;
      }

      // 2. 尝试多种解析策略
      let result: GeocodingResult | null = null;

      // 策略1: 地标识别
      result = await this.tryLandmarkRecognition(cleanedLocation, context);
      if (result && result.confidence >= 0.9) {
        this.cacheResult(cleanedLocation, result);
        const latency = Date.now() - startTime;
        this.recordMetrics(result, latency, result.source);
        this.metrics.successfulGeocodingRequests++;
        return result;
      }

      // 策略2: 相对位置解析（如"冰岛首都"）
      result = await this.tryRelativeLocation(cleanedLocation, context);
      if (result && result.confidence >= 0.8) {
        this.cacheResult(cleanedLocation, result);
        const latency = Date.now() - startTime;
        this.recordMetrics(result, latency, result.source);
        this.metrics.successfulGeocodingRequests++;
        return result;
      }

      // 策略3: 上下文增强解析（如"附近的"、"在...附近"）
      result = await this.tryContextualParsing(cleanedLocation, context);
      if (result && result.confidence >= 0.7) {
        this.cacheResult(cleanedLocation, result);
        const latency = Date.now() - startTime;
        this.recordMetrics(result, latency, result.source);
        this.metrics.successfulGeocodingRequests++;
        return result;
      }

      // 策略4: Google Maps 地理编码
      result = await this.tryGoogleMapsGeocoding(cleanedLocation, context);
      if (result && result.confidence >= 0.6) {
        this.cacheResult(cleanedLocation, result);
        const latency = Date.now() - startTime;
        this.recordMetrics(result, latency, result.source);
        this.metrics.successfulGeocodingRequests++;
        return result;
      }

      // 策略5: 模糊匹配（如果前面都失败）
      result = await this.tryFuzzyMatching(cleanedLocation, context);
      if (result && result.confidence >= 0.5) {
        this.cacheResult(cleanedLocation, result);
        const latency = Date.now() - startTime;
        this.recordMetrics(result, latency, result.source);
        this.metrics.successfulGeocodingRequests++;
        return result;
      }

      // 如果所有策略都失败，返回低置信度结果
      const fallbackResult: GeocodingResult = {
        normalizedName: cleanedLocation,
        confidence: 0.3,
        source: 'geocoding',
      };
      const latency = Date.now() - startTime;
      this.recordMetrics(fallbackResult, latency, 'geocoding');
      this.metrics.successfulGeocodingRequests++; // 仍然算成功，只是置信度低
      return fallbackResult;
    } catch (error: any) {
      this.metrics.failedGeocodingRequests++;
      const latency = Date.now() - startTime;
      this.recordLatency(latency);
      this.logger.error(`地理编码失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 清理位置名称
   */
  private cleanLocationName(location: string): string {
    return location
      .trim()
      .replace(/[，,。.？?！!、]/g, '')
      .replace(/\s+/g, ' ')
      .replace(/^在|^位于|^位于|^的|^附近|^周边/g, '')
      .trim();
  }

  /**
   * 策略1: 地标识别
   * 
   * 优先使用预定义坐标（如果可用），否则调用 Google Maps API
   */
  private async tryLandmarkRecognition(
    location: string,
    _context?: LocationContext
  ): Promise<GeocodingResult | null> {
    // 检查是否是已知地标
    if (this.landmarkMap.has(location)) {
      const landmark = this.landmarkMap.get(location)!;
      this.logger.debug(`识别为地标: "${location}" -> ${landmark.name}, ${landmark.city}`);
      
      const countryCode = this.getCountryCodeFromCountry(landmark.country);
      
      // 优先使用预定义坐标（如果可用）
      if (landmark.coordinates) {
        const validatedCoords = this.validateAndNormalizeCoordinates(
          landmark.coordinates.lat,
          landmark.coordinates.lng
        );
        
        if (validatedCoords) {
          // 空间范围验证
          if (countryCode && this.geographicDataValidator) {
            const spatialValidation = this.geographicDataValidator.validateSpatialRange(
              [validatedCoords],
              countryCode
            );
            const hasWarnings = !spatialValidation.valid || spatialValidation.warnings.length > 0;
            if (hasWarnings) {
              this.logger.warn(`地标预定义坐标可能不在目标国家范围内: ${landmark.name}, 坐标: ${validatedCoords.lat}, ${validatedCoords.lng}`);
            }
            this.recordCoordinateValidation(true, hasWarnings);
          }
          
          this.logger.debug(`使用预定义坐标: ${landmark.name} -> ${validatedCoords.lat}, ${validatedCoords.lng}`);
          
          return {
            normalizedName: landmark.name,
            coordinates: validatedCoords,
            city: landmark.city,
            country: landmark.country,
            countryCode,
            timezone: this.getTimezoneForCity(landmark.city),
            confidence: 0.98, // 预定义坐标置信度最高
            source: 'mapping',
          };
        }
      }
      
      // 如果没有预定义坐标，使用 Google Maps API 获取
      if (this.googleMapsDirectService?.isServiceAvailable()) {
        try {
          const geocodeResult = await this.googleMapsDirectService.geocode({
            address: `${landmark.name}, ${landmark.city}, ${landmark.country}`,
            language: 'en',
          });

          if (geocodeResult.success && geocodeResult.data?.results?.length > 0) {
            const result = geocodeResult.data.results[0];
            const location = result.geometry?.location;
            
            // 验证坐标
            let coordinates: { lat: number; lng: number } | undefined;
            if (location) {
              const validatedCoords = this.validateAndNormalizeCoordinates(location.lat, location.lng);
              if (validatedCoords) {
                coordinates = validatedCoords;
                
                // 空间范围验证（如果知道国家代码）
                if (countryCode && this.geographicDataValidator) {
                  const spatialValidation = this.geographicDataValidator.validateSpatialRange(
                    [coordinates],
                    countryCode
                  );
                  const hasWarnings = !spatialValidation.valid || spatialValidation.warnings.length > 0;
                  if (hasWarnings) {
                    this.logger.warn(`地标坐标可能不在目标国家范围内: ${landmark.name}, 坐标: ${coordinates.lat}, ${coordinates.lng}`);
                  }
                  this.recordCoordinateValidation(true, hasWarnings);
                }
              }
            }
            
            return {
              normalizedName: landmark.name,
              coordinates,
              city: landmark.city,
              country: landmark.country,
              countryCode,
              timezone: this.getTimezoneForCity(landmark.city),
              confidence: coordinates ? 0.95 : 0.85, // 有坐标的置信度更高
              source: 'mapping',
              metadata: {
                formattedAddress: result.formatted_address,
                placeId: result.place_id,
                types: result.types,
              },
            };
          }
        } catch (error: any) {
          this.logger.warn(`地标地理编码失败: ${error.message}`);
        }
      }

      // 降级：返回地标信息，但没有坐标
      return {
        normalizedName: landmark.name,
        city: landmark.city,
        country: landmark.country,
        countryCode,
        confidence: 0.85,
        source: 'mapping',
      };
    }

    return null;
  }

  /**
   * 策略2: 相对位置解析（如"冰岛首都"、"东京市中心"）
   */
  private async tryRelativeLocation(
    location: string,
    context?: LocationContext
  ): Promise<GeocodingResult | null> {
    // 检查是否包含相对位置关键词
    for (const [keyword] of this.relativeLocationMap.entries()) {
      if (location.includes(keyword)) {
        // 提取国家或城市名称
        const baseLocation = location.replace(keyword, '').trim();
        
        // 如果是"首都"，查找国家首都映射
        if (keyword === '首都' && this.capitalMap.has(baseLocation)) {
          const capital = this.capitalMap.get(baseLocation)!;
          this.logger.debug(`识别为首都: "${location}" -> ${capital}`);
          
          // 避免递归，直接调用 Google Maps 地理编码
          return await this.tryGoogleMapsGeocoding(capital, context);
        }

        // 如果是"市中心"，添加 "city center" 后缀
        if (keyword === '市中心' || keyword === '中心') {
          const cityName = baseLocation || context?.selectedDestination;
          if (cityName) {
            const normalizedCity = await this.normalizeCityName(cityName);
            const query = `${normalizedCity} city center`;
            this.logger.debug(`识别为市中心: "${location}" -> ${query}`);
            
            return await this.tryGoogleMapsGeocoding(query, context);
          }
        }
      }
    }

    return null;
  }

  /**
   * 策略3: 上下文增强解析
   */
  private async tryContextualParsing(
    location: string,
    context?: LocationContext
  ): Promise<GeocodingResult | null> {
    // 如果位置名称很短且上下文中有选定目的地，尝试组合
    if (location.length <= 3 && context?.selectedDestination) {
      const combinedLocation = `${context.selectedDestination} ${location}`;
      this.logger.debug(`上下文增强: "${location}" + "${context.selectedDestination}" -> "${combinedLocation}"`);
      
      return await this.tryGoogleMapsGeocoding(combinedLocation, context);
    }

    // 处理"附近的"、"在...附近"等模式
    const nearbyPattern = /(.+?)(附近|周边|旁边|邻近)/;
    const match = location.match(nearbyPattern);
    if (match) {
      const baseLocation = match[1].trim();
      this.logger.debug(`识别为附近位置: "${location}" -> "${baseLocation}"`);
      
      const baseResult = await this.geocode(baseLocation, context);
      if (baseResult.confidence >= 0.6) {
        return {
          ...baseResult,
          confidence: baseResult.confidence * 0.9, // 降低置信度，因为"附近"不够精确
        };
      }
    }

    return null;
  }

  /**
   * 策略4: Google Maps 地理编码
   */
  private async tryGoogleMapsGeocoding(
    location: string,
    context?: LocationContext
  ): Promise<GeocodingResult | null> {
    if (!this.googleMapsDirectService?.isServiceAvailable()) {
      return null;
    }

    try {
      const geocodeResult = await this.googleMapsDirectService.geocode({
        address: location,
        language: context?.language || 'en',
        region: context?.region,
      });

      if (geocodeResult.success && geocodeResult.data?.results?.length > 0) {
        const result = geocodeResult.data.results[0];
        const locationData = result.geometry?.location;
        const addressComponents = result.address_components || [];

        // 提取地址组件
        const city = addressComponents.find((comp: any) => 
          comp.types.includes('locality')
        )?.long_name;
        
        const country = addressComponents.find((comp: any) => 
          comp.types.includes('country')
        )?.long_name;
        
        const countryCode = addressComponents.find((comp: any) => 
          comp.types.includes('country')
        )?.short_name;

        // 提取行政区划信息
        const administrativeLevels: Record<string, string> = {};
        addressComponents.forEach((comp: any) => {
          if (comp.types.includes('administrative_area_level_1')) {
            administrativeLevels.province = comp.long_name;
          } else if (comp.types.includes('administrative_area_level_2')) {
            administrativeLevels.city = comp.long_name;
          }
        });

        // 构建标准化名称（优先使用城市名称）
        const normalizedName = city || country || result.formatted_address || location;

        // 尝试获取时区信息
        const timezone = this.getTimezoneForCity(city || normalizedName);

        // 验证和标准化坐标
        let validatedCoordinates: { lat: number; lng: number } | undefined;
        if (locationData) {
          validatedCoordinates = this.validateAndNormalizeCoordinates(locationData.lat, locationData.lng);
          
          // 空间范围验证（如果知道国家代码）
          if (validatedCoordinates && countryCode && this.geographicDataValidator) {
            const spatialValidation = this.geographicDataValidator.validateSpatialRange(
              [validatedCoordinates],
              countryCode
            );
            const hasWarnings = !spatialValidation.valid || spatialValidation.warnings.length > 0;
            if (hasWarnings) {
              this.logger.warn(`地理编码坐标可能不在目标国家范围内: ${normalizedName}, 坐标: ${validatedCoordinates.lat}, ${validatedCoordinates.lng}, 国家: ${countryCode}`);
            }
            this.recordCoordinateValidation(true, hasWarnings);
          }
        }

        return {
          normalizedName,
          coordinates: validatedCoordinates,
          address: result.formatted_address,
          city,
          country,
          countryCode,
          timezone,
          confidence: validatedCoordinates ? 0.85 : 0.75, // 有坐标的置信度更高
          source: 'geocoding',
          metadata: {
            administrativeLevels,
            formattedAddress: result.formatted_address,
            placeId: result.place_id,
            types: result.types,
          },
        };
      }
    } catch (error: any) {
      this.logger.warn(`Google Maps 地理编码失败: "${location}", error: ${error.message}`);
    }

    return null;
  }

  /**
   * 策略5: 模糊匹配
   */
  private async tryFuzzyMatching(
    location: string,
    context?: LocationContext
  ): Promise<GeocodingResult | null> {
    // 生成位置名称变体
    const variations = this.generateLocationVariations(location);

    let bestResult: GeocodingResult | null = null;
    let bestSimilarity = 0;

    for (const variation of variations) {
      if (variation === location) continue;

      // 先检查地标映射（快速路径）
      if (this.landmarkMap.has(variation)) {
        const similarity = this.calculateSimilarity(location, variation);
        
        if (similarity > bestSimilarity) {
          bestResult = await this.tryLandmarkRecognition(variation, context);
          if (bestResult) {
            bestResult.confidence = bestResult.confidence * similarity;
            bestSimilarity = similarity;
          }
        }
      }

      // 尝试 Google Maps 地理编码
      const result = await this.tryGoogleMapsGeocoding(variation, context);
      if (result && result.confidence >= 0.6) {
        const similarity = this.calculateSimilarity(location, variation);
        const adjustedConfidence = result.confidence * similarity * 0.8; // 降低置信度
        
        if (adjustedConfidence > bestSimilarity) {
          bestResult = {
            ...result,
            confidence: adjustedConfidence,
            source: 'fuzzy_match',
          };
          bestSimilarity = adjustedConfidence;
        }
      }
    }

    return bestResult && bestSimilarity >= 0.5 ? bestResult : null;
  }

  /**
   * 生成位置名称变体
   */
  private generateLocationVariations(location: string): string[] {
    const variations: string[] = [location];

    // 移除常见后缀
    const suffixes = ['市', '县', '区', '省', '国', '的', '地', '处'];
    for (const suffix of suffixes) {
      if (location.endsWith(suffix)) {
        variations.push(location.slice(0, -suffix.length));
      }
    }

    // 移除常见前缀
    const prefixes = ['在', '位于', '去', '到', '从'];
    for (const prefix of prefixes) {
      if (location.startsWith(prefix)) {
        variations.push(location.slice(prefix.length));
      }
    }

    // 处理"的"字结构（如"北京的" -> "北京"）
    if (location.includes('的')) {
      const parts = location.split('的');
      if (parts.length === 2 && parts[1].length <= 2) {
        variations.push(parts[0]);
      }
    }

    // 处理数字（如"1号公路" -> "一号公路"）
    variations.push(location.replace(/1号/g, '一号'));
    variations.push(location.replace(/一号/g, '1号'));

    // 去重并过滤空字符串
    return [...new Set(variations)].filter(v => v.length > 0);
  }

  /**
   * 计算字符串相似度（简单的编辑距离算法）
   */
  private calculateSimilarity(str1: string, str2: string): number {
    if (str1 === str2) return 1.0;
    if (str1.length === 0 || str2.length === 0) return 0.0;

    // 简单的包含关系检查
    if (str1.includes(str2) || str2.includes(str1)) {
      return 0.8;
    }

    // 计算编辑距离
    const maxLen = Math.max(str1.length, str2.length);
    const distance = this.levenshteinDistance(str1, str2);
    
    return 1 - (distance / maxLen);
  }

  /**
   * 计算编辑距离（Levenshtein Distance）
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const m = str1.length;
    const n = str2.length;
    const dp: number[][] = [];

    for (let i = 0; i <= m; i++) {
      dp[i] = [i];
    }
    for (let j = 0; j <= n; j++) {
      dp[0][j] = j;
    }

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = Math.min(
            dp[i - 1][j] + 1,     // 删除
            dp[i][j - 1] + 1,     // 插入
            dp[i - 1][j - 1] + 1  // 替换
          );
        }
      }
    }

    return dp[m][n];
  }

  /**
   * 标准化城市名称（使用现有的映射逻辑）
   */
  private async normalizeCityName(cityName: string): Promise<string> {
    // 这里可以调用现有的位置映射逻辑
    // 暂时返回原名称
    return cityName;
  }

  /**
   * 缓存结果
   */
  private cacheResult(location: string, result: GeocodingResult): void {
    this.geocodeCache.set(location, {
      result,
      timestamp: Date.now(),
    });
  }

  /**
   * 批量地理编码（优化错误处理）
   */
  async batchGeocode(
    locations: string[],
    context?: LocationContext
  ): Promise<Map<string, GeocodingResult>> {
    const results = new Map<string, GeocodingResult>();
    const errors: Array<{ location: string; error: string }> = [];
    
    this.metrics.batchProcessing.totalBatches++;
    this.metrics.batchProcessing.totalBatchItems += locations.length;
    
    // 并行处理，但限制并发数
    const batchSize = 5;
    for (let i = 0; i < locations.length; i += batchSize) {
      const batch = locations.slice(i, i + batchSize);
      
      // 使用 Promise.allSettled 确保单个失败不影响其他
      const batchPromises = batch.map(async (location) => {
        try {
          const result = await this.geocode(location, context);
          return { location, result, success: true };
        } catch (error: any) {
          this.metrics.batchProcessing.batchErrors++;
          errors.push({ location, error: error.message });
          this.logger.warn(`批量地理编码失败: "${location}" - ${error.message}`);
          
          // 返回低置信度结果，而不是抛出错误
          return {
            location,
            result: {
              normalizedName: location,
              confidence: 0.2,
              source: 'geocoding',
            } as GeocodingResult,
            success: false,
          };
        }
      });
      
      const batchResults = await Promise.allSettled(batchPromises);
      
      batchResults.forEach((settledResult, index) => {
        if (settledResult.status === 'fulfilled') {
          const { location, result } = settledResult.value;
          results.set(location, result);
        } else {
          // Promise.allSettled 不应该到这里，但为了安全起见
          const location = batch[index];
          this.metrics.batchProcessing.batchErrors++;
          errors.push({ location, error: settledResult.reason?.message || 'Unknown error' });
          results.set(location, {
            normalizedName: location,
            confidence: 0.1,
            source: 'geocoding',
          });
        }
      });
    }
    
    // 更新平均批次大小
    this.metrics.batchProcessing.avgBatchSize = 
      this.metrics.batchProcessing.totalBatchItems / this.metrics.batchProcessing.totalBatches;
    
    // 如果有错误，记录警告
    if (errors.length > 0) {
      this.logger.warn(`批量地理编码完成，${errors.length}/${locations.length} 个位置失败`);
    }
    
    return results;
  }

  /**
   * 验证和标准化坐标（地理科学家视角）
   * 
   * 1. 使用 GeographicDataValidatorService 进行严格验证
   * 2. 检查坐标精度（至少4位小数，约11米精度）
   * 3. 确保使用 WGS84 坐标系统
   * 4. 返回标准化后的坐标（保留适当精度）
   */
  private validateAndNormalizeCoordinates(
    lat: number,
    lng: number
  ): { lat: number; lng: number } | undefined {
    // 基础范围检查
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      this.logger.warn(`坐标超出有效范围: lat=${lat}, lng=${lng}`);
      this.recordCoordinateValidation(false);
      return undefined;
    }

    // 如果地理数据验证器可用，使用它进行严格验证
    if (this.geographicDataValidator) {
      const validation = this.geographicDataValidator.validateCoordinates(lat, lng);
      if (!validation.valid) {
        this.logger.warn(`坐标验证失败: ${validation.errors.map(e => e.message).join(', ')}`);
        this.recordCoordinateValidation(false);
        return undefined;
      }
      
      // 检查精度警告
      const hasWarnings = validation.warnings.length > 0;
      if (hasWarnings) {
        this.logger.debug(`坐标精度警告: ${validation.warnings.map(w => w.message).join(', ')}`);
      }
      
      // 记录验证结果
      this.recordCoordinateValidation(true, hasWarnings);
    } else {
      // 如果没有验证器，仍然记录基础验证通过
      this.recordCoordinateValidation(true, false);
    }

    // 标准化坐标精度（保留6位小数，约0.1米精度）
    return {
      lat: Math.round(lat * 1000000) / 1000000,
      lng: Math.round(lng * 1000000) / 1000000,
    };
  }

  /**
   * 验证坐标是否合理（公共接口，保持向后兼容）
   */
  validateCoordinates(lat: number, lng: number): boolean {
    const validated = this.validateAndNormalizeCoordinates(lat, lng);
    return validated !== undefined;
  }

  /**
   * 从国家名称获取国家代码（ISO 3166-1 alpha-2）
   */
  private getCountryCodeFromCountry(country: string): string | undefined {
    const countryCodeMap: Record<string, string> = {
      'China': 'CN',
      'Japan': 'JP',
      'South Korea': 'KR',
      'Thailand': 'TH',
      'Singapore': 'SG',
      'Malaysia': 'MY',
      'Indonesia': 'ID',
      'Philippines': 'PH',
      'Vietnam': 'VN',
      'Cambodia': 'KH',
      'United States': 'US',
      'Canada': 'CA',
      'United Kingdom': 'GB',
      'France': 'FR',
      'Germany': 'DE',
      'Italy': 'IT',
      'Spain': 'ES',
      'Portugal': 'PT',
      'Greece': 'GR',
      'Netherlands': 'NL',
      'Belgium': 'BE',
      'Switzerland': 'CH',
      'Austria': 'AT',
      'Sweden': 'SE',
      'Norway': 'NO',
      'Denmark': 'DK',
      'Finland': 'FI',
      'Iceland': 'IS',
      'Australia': 'AU',
      'New Zealand': 'NZ',
      'Brazil': 'BR',
      'Argentina': 'AR',
      'Chile': 'CL',
      'Peru': 'PE',
      'Colombia': 'CO',
      'South Africa': 'ZA',
      'Egypt': 'EG',
      'Morocco': 'MA',
      'Kenya': 'KE',
      'Vatican City': 'VA',
    };

    return countryCodeMap[country];
  }

  /**
   * 验证坐标是否在目标国家边界内（简化版，使用边界框）
   */
  private isCoordinateInCountryBounds(
    lat: number,
    lng: number,
    countryCode: string
  ): boolean {
    const bounds = this.countryBounds.get(countryCode);
    if (!bounds) {
      return true; // 如果不知道边界，假设有效
    }

    return (
      lat >= bounds.minLat &&
      lat <= bounds.maxLat &&
      lng >= bounds.minLng &&
      lng <= bounds.maxLng
    );
  }

  /**
   * 获取城市的时区信息
   */
  private getTimezoneForCity(cityName: string): string | undefined {
    // 直接匹配
    if (this.timezoneMap.has(cityName)) {
      return this.timezoneMap.get(cityName);
    }

    // 模糊匹配（检查是否包含）
    for (const [city, timezone] of this.timezoneMap.entries()) {
      if (cityName.includes(city) || city.includes(cityName)) {
        return timezone;
      }
    }

    return undefined;
  }

  /**
   * 记录指标
   */
  private recordMetrics(
    result: GeocodingResult,
    latency: number,
    source: GeocodingResult['source']
  ): void {
    // 记录延迟
    this.recordLatency(latency);
    
    // 记录来源分布
    if (source === 'mapping') {
      this.metrics.sourceDistribution.mapping++;
    } else if (source === 'cache') {
      this.metrics.sourceDistribution.cache++;
    } else if (source === 'geocoding') {
      this.metrics.sourceDistribution.geocoding++;
    } else if (source === 'fuzzy_match') {
      this.metrics.sourceDistribution.fuzzy_match++;
    }
    
    // 记录置信度分布
    if (result.confidence >= 0.9) {
      this.metrics.confidenceDistribution.high++;
    } else if (result.confidence >= 0.7) {
      this.metrics.confidenceDistribution.medium++;
    } else {
      this.metrics.confidenceDistribution.low++;
    }
    
    // 记录坐标精度
    if (result.coordinates) {
      this.metrics.coordinatePrecision.withCoordinates++;
      
      // 计算坐标的小数位数
      const latDecimalPlaces = this.countDecimalPlaces(result.coordinates.lat);
      const lngDecimalPlaces = this.countDecimalPlaces(result.coordinates.lng);
      const avgDecimalPlaces = (latDecimalPlaces + lngDecimalPlaces) / 2;
      
      this.decimalPlaces.push(avgDecimalPlaces);
      if (this.decimalPlaces.length > this.MAX_SAMPLES) {
        this.decimalPlaces.shift();
      }
      
      // 更新平均小数位数
      const sum = this.decimalPlaces.reduce((a, b) => a + b, 0);
      this.metrics.coordinatePrecision.avgDecimalPlaces = sum / this.decimalPlaces.length;
    } else {
      this.metrics.coordinatePrecision.withoutCoordinates++;
    }
  }
  
  /**
   * 记录延迟
   */
  private recordLatency(latency: number): void {
    this.latencies.push(latency);
    if (this.latencies.length > this.MAX_SAMPLES) {
      this.latencies.shift();
    }
    
    // 更新性能指标
    this.updatePerformanceMetrics();
  }
  
  /**
   * 更新性能指标（计算百分位数）
   */
  private updatePerformanceMetrics(): void {
    if (this.latencies.length === 0) return;
    
    const sorted = [...this.latencies].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    
    this.metrics.performance.avgLatency = sum / sorted.length;
    this.metrics.performance.p50Latency = this.percentile(sorted, 50);
    this.metrics.performance.p95Latency = this.percentile(sorted, 95);
    this.metrics.performance.p99Latency = this.percentile(sorted, 99);
  }
  
  /**
   * 计算百分位数
   */
  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
  }
  
  /**
   * 计算数字的小数位数
   */
  private countDecimalPlaces(num: number): number {
    if (Math.floor(num) === num) return 0;
    const str = num.toString();
    if (str.indexOf('.') !== -1 && str.indexOf('e') === -1) {
      return str.split('.')[1].length;
    } else if (str.indexOf('e') !== -1) {
      const parts = str.split('e');
      const decimalPart = parts[0].split('.')[1] || '';
      const exponent = parseInt(parts[1], 10);
      return decimalPart.length - exponent;
    }
    return 0;
  }
  
  /**
   * 记录坐标验证结果
   */
  recordCoordinateValidation(valid: boolean, spatialRangeWarning: boolean = false): void {
    if (valid) {
      this.metrics.validation.validatedCoordinates++;
    } else {
      this.metrics.validation.invalidCoordinates++;
    }
    
    if (spatialRangeWarning) {
      this.metrics.validation.spatialRangeWarnings++;
    }
    
    this.metrics.validation.spatialRangeValidations++;
  }
  
  /**
   * 获取监控指标
   */
  getMetrics(): GeocodingMetrics {
    return { ...this.metrics };
  }
  
  /**
   * 重置监控指标
   */
  resetMetrics(): void {
    this.metrics.totalGeocodingRequests = 0;
    this.metrics.successfulGeocodingRequests = 0;
    this.metrics.failedGeocodingRequests = 0;
    this.metrics.sourceDistribution = { mapping: 0, cache: 0, geocoding: 0, fuzzy_match: 0 };
    this.metrics.confidenceDistribution = { high: 0, medium: 0, low: 0 };
    this.metrics.coordinatePrecision = { withCoordinates: 0, withoutCoordinates: 0, avgDecimalPlaces: 0 };
    this.metrics.performance = { avgLatency: 0, p50Latency: 0, p95Latency: 0, p99Latency: 0 };
    this.metrics.validation = { validatedCoordinates: 0, invalidCoordinates: 0, spatialRangeValidations: 0, spatialRangeWarnings: 0 };
    this.metrics.batchProcessing = { totalBatches: 0, totalBatchItems: 0, batchErrors: 0, avgBatchSize: 0 };
    this.latencies.length = 0;
    this.decimalPlaces.length = 0;
  }

  /**
   * 清理过期缓存
   */
  cleanExpiredCache(): void {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, value] of this.geocodeCache.entries()) {
      if (now - value.timestamp >= this.GEOCODE_CACHE_TTL) {
        this.geocodeCache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.debug(`清理了 ${cleaned} 个过期缓存项`);
    }
  }
}
