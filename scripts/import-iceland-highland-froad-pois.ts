#!/usr/bin/env tsx
/**
 * 导入冰岛内陆高地F路5天游线POI数据
 * 
 * POI分类：
 * 1. 入口/出口POI（Route Gate）
 * 2. 核心F路节点（F-road Node）
 * 3. 河流穿越POI（River Crossing）
 * 4. 补给/生存POI（Critical Supply）
 * 5. 住宿/庇护POI（Shelter）
 * 6. 核心自然景观POI（Must-see）
 * 7. 徒步/活动POI（Activity）
 * 8. 应急/风控POI（Safety）
 * 9. 信息源POI（Info Source）
 */

import { PrismaClient, PlaceCategory } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

// ============================================
// POI 子类型定义
// ============================================
type HighlandPoiSubCategory = 
  | 'ROUTE_GATE'       // 入口/出口
  | 'F_ROAD_NODE'      // F路核心节点
  | 'RIVER_CROSSING'   // 河流穿越
  | 'GAS_STATION'      // 加油站
  | 'SUPPLY'           // 补给点
  | 'HUT'              // 山屋
  | 'SCENIC'           // 核心景观
  | 'HIKING'           // 徒步活动
  | 'HOT_SPRING'       // 温泉
  | 'SAFETY'           // 应急安全
  | 'INFO_SOURCE';     // 信息源（虚拟POI）

type RiskLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';

// ============================================
// POI 元数据扩展接口
// ============================================
interface HighlandPoiMetadata {
  // 高地POI专属字段
  subCategory: HighlandPoiSubCategory;
  fRoadTags?: string[];           // 关联的F路编号
  riskLevel?: RiskLevel;          // 风险等级
  
  // 河流穿越专属
  riverCrossing?: {
    multipleStreams?: boolean;    // 是否多股水流
    canBypass?: boolean;          // 是否可绕行
    depthCm?: number;             // 水深(cm)
    bestCrossingTime?: string;    // 建议通过时间段
  };
  
  // 补给点专属
  supply?: {
    hasGas?: boolean;             // 有加油
    hasFood?: boolean;            // 有食物
    hasWater?: boolean;           // 有水源
    isPotableWater?: boolean;     // 是否可饮用水
    lastFullSupply?: boolean;     // 是否最后完整补给点
  };
  
  // 山屋专属
  hut?: {
    requiresBooking?: boolean;    // 是否需预订
    hasHeating?: boolean;         // 是否有暖气
    allowsCamping?: boolean;      // 是否允许露营
    hasSignal?: boolean;          // 是否有信号
    operatedBy?: string;          // 运营方
    capacity?: number;            // 容量
  };
  
  // 安全/应急专属
  safety?: {
    rescueCoverage?: boolean;     // 救援覆盖
    emergencyShelter?: boolean;   // 应急庇护
    satelliteTracking?: boolean;  // 卫星定位
    weatherStation?: boolean;     // 天气站
    noSignalZone?: boolean;       // 无信号区
  };
  
  // 信息源专属
  infoSource?: {
    url?: string;                 // 网址
    dataType?: string;            // 数据类型
    updateFrequency?: string;     // 更新频率
  };
  
  // 通用字段
  region?: string;                // 区域
  elevation_m?: number;           // 海拔
  seasonality?: {                 // 季节性
    openMonths?: string[];        // 开放月份
    bestMonths?: string[];        // 最佳月份
  };
  highlights?: string[];          // 亮点标签
  warnings?: string[];            // 警告信息
  tips?: string[];                // 建议提示
}

// ============================================
// POI 数据定义
// ============================================
interface HighlandPoiData {
  nameCN: string;
  nameEN: string;
  nameIS?: string;              // 冰岛语名称
  category: PlaceCategory;
  lat: number;
  lng: number;
  description: string;
  metadata: HighlandPoiMetadata;
}

// ============================================
// 完整POI数据列表
// ============================================
const highlandPois: HighlandPoiData[] = [
  // ==========================================
  // 一、入口/出口 POI（Route Gate）
  // ==========================================
  {
    nameCN: '塞尔福斯',
    nameEN: 'Selfoss',
    nameIS: 'Selfoss',
    category: PlaceCategory.TRANSIT_HUB,
    lat: 63.9330,
    lng: -21.0023,
    description: '南部最后完整补给点，进入高地前的重要补给站。拥有超市、加油站、餐厅等完整设施。',
    metadata: {
      subCategory: 'ROUTE_GATE',
      region: 'South Iceland',
      supply: {
        hasGas: true,
        hasFood: true,
        hasWater: true,
        isPotableWater: true,
        lastFullSupply: true,
      },
      highlights: ['最后完整补给', 'N1加油站', 'Bonus超市', 'Krónan超市'],
      tips: ['建议在此加满油', '购买3-5天食物和水', '检查车辆状态'],
    },
  },
  {
    nameCN: '海拉',
    nameEN: 'Hella',
    nameIS: 'Hella',
    category: PlaceCategory.TRANSIT_HUB,
    lat: 63.8359,
    lng: -20.3957,
    description: '高地南部入口前的补给站，距离Landmannalaugar约2小时车程。',
    metadata: {
      subCategory: 'ROUTE_GATE',
      region: 'South Iceland',
      supply: {
        hasGas: true,
        hasFood: true,
        hasWater: true,
        isPotableWater: true,
      },
      highlights: ['补给站', 'N1加油站'],
      tips: ['高地入口前最后加油机会'],
    },
  },
  {
    nameCN: '米湖',
    nameEN: 'Mývatn',
    nameIS: 'Mývatn',
    category: PlaceCategory.TRANSIT_HUB,
    lat: 65.6030,
    lng: -16.9963,
    description: '北部文明出口，高地旅程终点。拥有完整旅游设施，是恢复和休整的理想地点。',
    metadata: {
      subCategory: 'ROUTE_GATE',
      region: 'North Iceland',
      supply: {
        hasGas: true,
        hasFood: true,
        hasWater: true,
        isPotableWater: true,
      },
      highlights: ['北部出口', '温泉', '火山地貌', '鸟类观察'],
      tips: ['高地旅程完成后的恢复点', '推荐泡温泉放松'],
    },
  },

  // ==========================================
  // 二、核心F路节点（F-road Node）
  // ==========================================
  {
    nameCN: '兰德曼纳劳卡',
    nameEN: 'Landmannalaugar',
    nameIS: 'Landmannalaugar',
    category: PlaceCategory.ATTRACTION,
    lat: 63.9930,
    lng: -19.0618,
    description: 'F208起点，冰岛高地最著名的景点之一。彩色流纹岩山脉、天然温泉、多条徒步路线的起点。',
    metadata: {
      subCategory: 'F_ROAD_NODE',
      fRoadTags: ['F208', 'F225'],
      region: 'Highland',
      elevation_m: 600,
      seasonality: {
        openMonths: ['June', 'July', 'August', 'September'],
        bestMonths: ['July', 'August'],
      },
      highlights: ['彩色流纹岩', '天然温泉', 'Laugavegur起点', 'F208入口'],
      hut: {
        requiresBooking: true,
        hasHeating: true,
        allowsCamping: true,
        hasSignal: false,
        operatedBy: 'FÍ (Ferðafélag Íslands)',
        capacity: 78,
      },
      tips: ['提前预订山屋', '必须4x4车辆', '需要渡河进入'],
    },
  },
  {
    nameCN: '索斯莫克',
    nameEN: 'Þórsmörk',
    nameIS: 'Þórsmörk',
    category: PlaceCategory.ATTRACTION,
    lat: 63.6800,
    lng: -19.4800,
    description: '位于三座冰川之间的山谷，冰岛最美徒步目的地之一。F225连接Landmannalaugar。',
    metadata: {
      subCategory: 'F_ROAD_NODE',
      fRoadTags: ['F225', 'F249'],
      region: 'Highland',
      elevation_m: 200,
      seasonality: {
        openMonths: ['June', 'July', 'August', 'September'],
        bestMonths: ['July', 'August'],
      },
      highlights: ['冰川峡谷', 'Laugavegur终点', 'Fimmvörðuháls', '极致风景'],
      hut: {
        requiresBooking: true,
        hasHeating: true,
        allowsCamping: true,
        hasSignal: false,
        operatedBy: 'Multiple',
        capacity: 100,
      },
      warnings: ['需要渡过Krossá河', '只有改装4x4或大巴能进入'],
    },
  },
  {
    nameCN: '斯普伦吉桑杜尔',
    nameEN: 'Sprengisandur',
    nameIS: 'Sprengisandur',
    category: PlaceCategory.ATTRACTION,
    lat: 64.7500,
    lng: -18.5000,
    description: 'F26高地纵贯公路，冰岛最荒凉的公路之一。连接南北的高地中心地带。',
    metadata: {
      subCategory: 'F_ROAD_NODE',
      fRoadTags: ['F26'],
      region: 'Central Highland',
      elevation_m: 800,
      seasonality: {
        openMonths: ['July', 'August'],
        bestMonths: ['July', 'August'],
      },
      highlights: ['高地纵贯', '荒原景观', '极致荒凉', '火山沙漠'],
      warnings: ['全程无加油站', '无手机信号', '天气变化剧烈'],
      tips: ['确保油量充足', '携带卫星通讯设备', '查看road.is路况'],
    },
  },
  {
    nameCN: '阿斯基亚火山',
    nameEN: 'Askja',
    nameIS: 'Askja',
    category: PlaceCategory.ATTRACTION,
    lat: 65.0300,
    lng: -16.7500,
    description: 'F910通往的火山口群，包含Víti温泉火山口和冰岛最深湖Öskjuvatn。NASA宇航员曾在此训练。',
    metadata: {
      subCategory: 'F_ROAD_NODE',
      fRoadTags: ['F910', 'F88'],
      region: 'Highland',
      elevation_m: 1100,
      seasonality: {
        openMonths: ['July', 'August'],
        bestMonths: ['July', 'August'],
      },
      highlights: ['火星地貌', 'Víti火山口', 'Öskjuvatn最深湖', 'NASA训练地'],
      hut: {
        requiresBooking: true,
        hasHeating: true,
        allowsCamping: true,
        hasSignal: false,
        operatedBy: 'FÍ',
        capacity: 30,
      },
      warnings: ['道路开放时间短', '需要渡河', '天气极端'],
    },
  },

  // ==========================================
  // 三、河流穿越 POI（River Crossing）
  // ==========================================
  {
    nameCN: '克罗萨河渡口',
    nameEN: 'Krossá River Crossing',
    nameIS: 'Krossá',
    category: PlaceCategory.ATTRACTION,
    lat: 63.6850,
    lng: -19.5200,
    description: '通往Þórsmörk的标志性河流穿越，冰岛最著名也是最危险的河流穿越之一。',
    metadata: {
      subCategory: 'RIVER_CROSSING',
      fRoadTags: ['F249'],
      riskLevel: 'HIGH',
      riverCrossing: {
        multipleStreams: true,
        canBypass: false,
        depthCm: 60,
        bestCrossingTime: '早晨6-10点',
      },
      highlights: ['标志性渡河', '冰川河'],
      warnings: [
        '🔴 高风险河流穿越',
        '水深和流速随天气变化',
        '下午水位通常最高',
        '必须有经验的司机',
        '建议多车结伴',
      ],
      tips: [
        '早晨渡河水位最低',
        '观察其他车辆路线',
        '低档位稳速通过',
        '不要停车',
      ],
    },
  },
  {
    nameCN: '斯基亚尔凡达河渡口',
    nameEN: 'Skjálfandafljót Crossing',
    nameIS: 'Skjálfandafljót',
    category: PlaceCategory.ATTRACTION,
    lat: 64.8000,
    lng: -18.0000,
    description: 'Sprengisandur (F26) 上的主要河流穿越点，冰川融水河。',
    metadata: {
      subCategory: 'RIVER_CROSSING',
      fRoadTags: ['F26'],
      riskLevel: 'MEDIUM',
      riverCrossing: {
        multipleStreams: true,
        canBypass: false,
        depthCm: 50,
        bestCrossingTime: '早晨',
      },
      highlights: ['Sprengisandur渡河点'],
      warnings: [
        '🟠 中高风险',
        '水位随天气和时间变化',
        '冰川融水，水温极低',
      ],
      tips: ['查看当日水位信息', '跟随车辙痕迹'],
    },
  },
  {
    nameCN: '阿斯基亚冰川河渡口',
    nameEN: 'Askja Glacier River Crossings',
    nameIS: 'Askja River',
    category: PlaceCategory.ATTRACTION,
    lat: 65.0000,
    lng: -16.8500,
    description: 'F910/F88通往Askja途中的多处冰川河穿越。',
    metadata: {
      subCategory: 'RIVER_CROSSING',
      fRoadTags: ['F910', 'F88'],
      riskLevel: 'MEDIUM',
      riverCrossing: {
        multipleStreams: true,
        canBypass: false,
        depthCm: 40,
        bestCrossingTime: '早晨',
      },
      warnings: [
        '🟠 中等风险',
        '多处连续渡河',
        '需要持续专注',
      ],
    },
  },

  // ==========================================
  // 四、补给/生存 POI（Critical Supply）
  // ==========================================
  {
    nameCN: '尼达鲁尔应急加油站',
    nameEN: 'Nýidalur Emergency Fuel',
    nameIS: 'Nýidalur',
    category: PlaceCategory.ATTRACTION,
    lat: 64.7300,
    lng: -18.1000,
    description: 'Sprengisandur (F26) 唯一的应急补给点。有限的燃油和基本物资。',
    metadata: {
      subCategory: 'GAS_STATION',
      fRoadTags: ['F26'],
      region: 'Central Highland',
      supply: {
        hasGas: true,
        hasFood: false,
        hasWater: true,
        isPotableWater: false,
      },
      hut: {
        requiresBooking: true,
        hasHeating: true,
        allowsCamping: true,
        hasSignal: false,
        operatedBy: 'FÍ',
        capacity: 120,
      },
      highlights: ['Sprengisandur唯一补给', '高地山屋'],
      warnings: [
        '燃油供应有限',
        '价格较高',
        '不是正规加油站',
        '可能无库存',
      ],
      tips: [
        '不要依赖此处加油',
        '出发前确保油量充足',
        '只作为应急备选',
      ],
    },
  },
  {
    nameCN: '塞尔福斯N1加油站',
    nameEN: 'Selfoss N1 Gas Station',
    category: PlaceCategory.ATTRACTION,
    lat: 63.9355,
    lng: -20.9950,
    description: '进入高地前最后的完整加油站，建议在此加满油。',
    metadata: {
      subCategory: 'GAS_STATION',
      region: 'South Iceland',
      supply: {
        hasGas: true,
        hasFood: true,
        hasWater: true,
        isPotableWater: true,
        lastFullSupply: true,
      },
      highlights: ['24小时自助加油', '便利店', '热食'],
    },
  },

  // ==========================================
  // 五、住宿/庇护 POI（Shelter）
  // ==========================================
  {
    nameCN: '兰德曼纳劳卡山屋',
    nameEN: 'Landmannalaugar Hut',
    nameIS: 'Landmannalaugaskáli',
    category: PlaceCategory.HOTEL,
    lat: 63.9928,
    lng: -19.0615,
    description: '冰岛旅行协会运营的山屋，提供住宿和露营设施。',
    metadata: {
      subCategory: 'HUT',
      region: 'Highland',
      hut: {
        requiresBooking: true,
        hasHeating: true,
        allowsCamping: true,
        hasSignal: false,
        operatedBy: 'FÍ (Ferðafélag Íslands)',
        capacity: 78,
      },
      highlights: ['天然温泉旁', '徒步基地'],
      tips: ['夏季需提前预订', '自带睡袋', '温泉免费使用'],
    },
  },
  {
    nameCN: '索斯莫克山屋',
    nameEN: 'Þórsmörk Huts',
    nameIS: 'Þórsmörk',
    category: PlaceCategory.HOTEL,
    lat: 63.6795,
    lng: -19.4750,
    description: '多个运营方在Þórsmörk运营山屋，包括Volcano Huts、Básar等。',
    metadata: {
      subCategory: 'HUT',
      region: 'Highland',
      hut: {
        requiresBooking: true,
        hasHeating: true,
        allowsCamping: true,
        hasSignal: false,
        operatedBy: 'Multiple (Volcano Huts, FÍ, Útivist)',
        capacity: 100,
      },
      highlights: ['冰川景观', '徒步天堂'],
      warnings: ['需要渡河才能到达'],
    },
  },
  {
    nameCN: '尼达鲁尔山屋',
    nameEN: 'Nýidalur Hut',
    nameIS: 'Nýidalur',
    category: PlaceCategory.HOTEL,
    lat: 64.7300,
    lng: -18.1000,
    description: 'Sprengisandur高地中心的山屋，F26上唯一的住宿点。',
    metadata: {
      subCategory: 'HUT',
      fRoadTags: ['F26'],
      region: 'Central Highland',
      hut: {
        requiresBooking: true,
        hasHeating: true,
        allowsCamping: true,
        hasSignal: false,
        operatedBy: 'FÍ',
        capacity: 120,
      },
      highlights: ['高地中心', 'Sprengisandur唯一山屋'],
      tips: ['夏季开放', '提前预订'],
    },
  },
  {
    nameCN: '德雷基山屋',
    nameEN: 'Dreki Hut',
    nameIS: 'Dreki',
    category: PlaceCategory.HOTEL,
    lat: 65.0450,
    lng: -16.7300,
    description: 'Askja火山区的山屋，距离Víti火山口约8公里。',
    metadata: {
      subCategory: 'HUT',
      fRoadTags: ['F910', 'F88'],
      region: 'Highland',
      hut: {
        requiresBooking: true,
        hasHeating: true,
        allowsCamping: true,
        hasSignal: false,
        operatedBy: 'FÍ',
        capacity: 60,
      },
      highlights: ['Askja基地', '火山区住宿'],
      tips: ['徒步Askja的最佳基地'],
    },
  },

  // ==========================================
  // 六、核心自然景观 POI（Must-see）
  // ==========================================
  {
    nameCN: '彩色流纹岩山',
    nameEN: 'Brennisteinsalda',
    nameIS: 'Brennisteinsalda',
    category: PlaceCategory.ATTRACTION,
    lat: 63.9850,
    lng: -19.0600,
    description: '冰岛最色彩斑斓的山峰，位于Landmannalaugar。绿色、红色、黄色、蓝色交织的流纹岩。',
    metadata: {
      subCategory: 'SCENIC',
      region: 'Landmannalaugar',
      elevation_m: 855,
      highlights: ['彩色流纹岩', '标志性景观', '摄影圣地'],
      tips: ['最佳光线在早晨或傍晚', '需要徒步约1小时'],
    },
  },
  {
    nameCN: 'Víti火山口湖',
    nameEN: 'Víti Crater',
    nameIS: 'Víti',
    category: PlaceCategory.ATTRACTION,
    lat: 65.0480,
    lng: -16.7200,
    description: 'Askja火山区的温泉火山口湖，蓝绿色的湖水，可以下去游泳（水温约25°C）。',
    metadata: {
      subCategory: 'SCENIC',
      fRoadTags: ['F910'],
      region: 'Askja',
      elevation_m: 1053,
      highlights: ['火山口湖', '可游泳', '火星地貌'],
      warnings: ['下降到湖边较陡', '水温不稳定', '注意火山活动'],
      tips: ['带泳衣', '小心滑倒', '不要独自游泳'],
    },
  },
  {
    nameCN: '欧斯丘瓦湖',
    nameEN: 'Öskjuvatn',
    nameIS: 'Öskjuvatn',
    category: PlaceCategory.ATTRACTION,
    lat: 65.0500,
    lng: -16.7500,
    description: '冰岛最深湖泊（217米），位于Askja火山口内。1875年大喷发后形成。',
    metadata: {
      subCategory: 'SCENIC',
      fRoadTags: ['F910'],
      region: 'Askja',
      highlights: ['冰岛最深湖', '火山口湖', '1875年喷发遗迹'],
      warnings: ['湖水极冷', '禁止游泳'],
    },
  },
  {
    nameCN: '瓦拉努库尔观景点',
    nameEN: 'Valahnúkur',
    nameIS: 'Valahnúkur',
    category: PlaceCategory.ATTRACTION,
    lat: 63.6750,
    lng: -19.5000,
    description: 'Þórsmörk的观景山峰，可俯瞰整个山谷和周围冰川。',
    metadata: {
      subCategory: 'SCENIC',
      region: 'Þórsmörk',
      elevation_m: 458,
      highlights: ['360度全景', '冰川景观', '峡谷俯瞰'],
      tips: ['徒步约2小时往返', '日落时分最美'],
    },
  },

  // ==========================================
  // 七、徒步/活动 POI（Activity）
  // ==========================================
  {
    nameCN: '布伦尼斯坦达环线',
    nameEN: 'Brennisteinsalda Loop',
    nameIS: 'Brennisteinsalda gönguleið',
    category: PlaceCategory.ATTRACTION,
    lat: 63.9870,
    lng: -19.0650,
    description: 'Landmannalaugar最受欢迎的徒步路线，环绕彩色流纹岩山。',
    metadata: {
      subCategory: 'HIKING',
      region: 'Landmannalaugar',
      highlights: ['3-4小时徒步', '彩色山景', '温泉回归'],
      tips: ['难度中等', '需要登山鞋', '带足够水'],
    },
  },
  {
    nameCN: '阿斯基亚火山环线',
    nameEN: 'Askja Caldera Hike',
    nameIS: 'Askja gönguleið',
    category: PlaceCategory.ATTRACTION,
    lat: 65.0350,
    lng: -16.7400,
    description: '从停车场到Víti火山口的徒步路线，可延伸环绕Öskjuvatn。',
    metadata: {
      subCategory: 'HIKING',
      fRoadTags: ['F910'],
      region: 'Askja',
      highlights: ['2-3小时徒步', '火山口探索', '可游泳'],
      tips: ['带泳衣', '小心火山地形', '天气变化快'],
    },
  },
  {
    nameCN: '兰德曼纳劳卡天然温泉',
    nameEN: 'Landmannalaugar Hot Spring',
    nameIS: 'Landmannalaugar laug',
    category: PlaceCategory.ATTRACTION,
    lat: 63.9925,
    lng: -19.0610,
    description: '冰岛最著名的天然温泉之一，冷热水交汇形成舒适温度。免费开放。',
    metadata: {
      subCategory: 'HOT_SPRING',
      region: 'Landmannalaugar',
      highlights: ['天然温泉', '免费', '徒步后放松'],
      tips: ['带泳衣', '入水处较滑', '温度约38-40°C'],
    },
  },

  // ==========================================
  // 八、应急/风控 POI（Safety）
  // ==========================================
  {
    nameCN: '高地救援覆盖区信息',
    nameEN: 'Highland Rescue Coverage',
    category: PlaceCategory.ATTRACTION,
    lat: 64.5000,
    lng: -18.5000,
    description: '冰岛高地救援服务覆盖区域信息。高地救援由ICE-SAR志愿者组织负责。',
    metadata: {
      subCategory: 'SAFETY',
      region: 'Highland',
      safety: {
        rescueCoverage: true,
        noSignalZone: true,
      },
      highlights: ['ICE-SAR救援', '112紧急电话'],
      warnings: [
        '高地无手机信号',
        '救援响应时间长',
        '可能需要直升机救援',
      ],
      tips: [
        '注册safetravel.is行程',
        '携带卫星通讯设备',
        '告知他人行程计划',
        '下载112 Iceland App',
      ],
    },
  },
  {
    nameCN: '高地天气监测站',
    nameEN: 'Highland Weather Stations',
    category: PlaceCategory.ATTRACTION,
    lat: 64.6000,
    lng: -18.3000,
    description: '高地气象站网络，提供实时天气数据。vedur.is可查询。',
    metadata: {
      subCategory: 'SAFETY',
      region: 'Highland',
      safety: {
        weatherStation: true,
      },
      infoSource: {
        url: 'https://vedur.is',
        dataType: '天气预报和实时数据',
        updateFrequency: '每小时',
      },
      tips: ['出发前查看天气', '关注风速和降水', '高地天气变化快'],
    },
  },

  // ==========================================
  // 九、信息源 POI（虚拟POI）
  // ==========================================
  {
    nameCN: 'road.is路况信息',
    nameEN: 'road.is Road Conditions',
    category: PlaceCategory.ATTRACTION,
    lat: 64.1466,
    lng: -21.9426,
    description: '冰岛道路管理局官方路况信息平台。查询F路开放状态、路况实时信息。',
    metadata: {
      subCategory: 'INFO_SOURCE',
      infoSource: {
        url: 'https://road.is',
        dataType: 'F路开放状态',
        updateFrequency: '实时更新',
      },
      highlights: ['F路开放查询', '路况预警', '官方信息'],
      tips: [
        '每天出发前检查',
        '绿色=开放，红色=关闭',
        '黄色=需要特别注意',
      ],
    },
  },
  {
    nameCN: 'safetravel.is安全信息',
    nameEN: 'safetravel.is Safety Info',
    category: PlaceCategory.ATTRACTION,
    lat: 64.1466,
    lng: -21.9426,
    description: '冰岛旅行安全官方平台。提供安全预警、行程注册、应急信息。',
    metadata: {
      subCategory: 'INFO_SOURCE',
      infoSource: {
        url: 'https://safetravel.is',
        dataType: '安全预警和行程注册',
        updateFrequency: '实时更新',
      },
      highlights: ['行程注册', '安全预警', 'ICE-SAR合作'],
      tips: [
        '高地旅行前注册行程',
        '设置预计返回时间',
        '紧急时可触发救援',
      ],
    },
  },
  {
    nameCN: 'vedur.is天气预报',
    nameEN: 'vedur.is Weather',
    category: PlaceCategory.ATTRACTION,
    lat: 64.1466,
    lng: -21.9426,
    description: '冰岛气象局官方天气预报平台。高地专属天气预报。',
    metadata: {
      subCategory: 'INFO_SOURCE',
      infoSource: {
        url: 'https://vedur.is',
        dataType: '天气预报',
        updateFrequency: '每3小时',
      },
      highlights: ['高地天气', '风速预报', '降水预报'],
      tips: [
        '查看5日预报',
        '关注风速（风速>15m/s避免出行）',
        '高地天气独立预报区',
      ],
    },
  },
];

// ============================================
// 导入函数
// ============================================
async function importHighlandPois() {
  console.log('='.repeat(70));
  console.log('🏔️  导入冰岛内陆高地F路5天游线POI数据');
  console.log('='.repeat(70));
  console.log('');

  try {
    // 1. 查找或创建冰岛城市
    console.log('🏙️  查找冰岛城市...');
    let icelandCity = await prisma.city.findFirst({
      where: {
        countryCode: 'IS',
      },
    });

    if (!icelandCity) {
      console.log('  未找到冰岛城市，创建雷克雅未克...');
      icelandCity = await prisma.city.create({
        data: {
          name: 'Reykjavík',
          nameEN: 'Reykjavík',
          nameCN: '雷克雅未克',
          countryCode: 'IS',
          timezone: 'Atlantic/Reykjavik',
        },
      });
      console.log(`  ✅ 创建城市: ${icelandCity.nameCN} (ID: ${icelandCity.id})`);
    } else {
      console.log(`  ✅ 找到城市: ${icelandCity.nameCN || icelandCity.name} (ID: ${icelandCity.id})`);
    }
    console.log('');

    // 2. 统计现有POI
    const existingCount = await prisma.place.count({
      where: { cityId: icelandCity.id },
    });
    console.log(`📊 现有POI数量: ${existingCount}`);
    console.log(`📊 待导入POI数量: ${highlandPois.length}`);
    console.log('');

    // 3. 按类别统计
    const categoryStats: Record<string, number> = {};
    highlandPois.forEach((poi) => {
      const subCat = poi.metadata.subCategory;
      categoryStats[subCat] = (categoryStats[subCat] || 0) + 1;
    });
    
    console.log('📋 POI分类统计:');
    Object.entries(categoryStats).forEach(([cat, count]) => {
      console.log(`  • ${cat}: ${count} 个`);
    });
    console.log('');

    // 4. 导入POI
    console.log('📍 开始导入POI...');
    let imported = 0;
    let updated = 0;
    let errors = 0;

    for (const poi of highlandPois) {
      try {
        // 检查是否已存在
        const existingPlace = await prisma.place.findFirst({
          where: {
            nameEN: poi.nameEN,
            cityId: icelandCity.id,
          },
        });

        const placeData = {
          nameEN: poi.nameEN,
          nameCN: poi.nameCN,
          category: poi.category,
          cityId: icelandCity.id,
          description: poi.description,
          metadata: poi.metadata as any,
          rating: 5.0,
          updatedAt: new Date(),
        };

        let placeId: number;

        if (existingPlace) {
          // 更新现有记录
          await prisma.place.update({
            where: { id: existingPlace.id },
            data: placeData,
          });
          placeId = existingPlace.id;
          updated++;
          console.log(`  ♻️  更新: ${poi.nameCN} (${poi.nameEN})`);
        } else {
          // 创建新记录
          const newPlace = await prisma.place.create({
            data: {
              ...placeData,
              uuid: uuidv4(),
              createdAt: new Date(),
            },
          });
          placeId = newPlace.id;
          imported++;
          console.log(`  ✅ 导入: ${poi.nameCN} (${poi.nameEN})`);
        }

        // 更新location字段（PostGIS地理坐标）
        await prisma.$executeRawUnsafe(
          `UPDATE "Place"
           SET location = ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
           WHERE id = $3`,
          poi.lng,
          poi.lat,
          placeId
        );

      } catch (error: any) {
        console.error(`  ❌ 导入失败: ${poi.nameCN} - ${error.message}`);
        errors++;
      }
    }

    // 5. 导入统计
    console.log('');
    console.log('='.repeat(70));
    console.log('📊 导入统计:');
    console.log(`  ✅ 新增: ${imported} 个`);
    console.log(`  ♻️  更新: ${updated} 个`);
    console.log(`  ❌ 失败: ${errors} 个`);
    console.log(`  📦 总计: ${highlandPois.length} 个`);
    console.log('='.repeat(70));
    console.log('');

    // 6. 验证导入结果
    console.log('🔍 验证导入结果...');
    
    // 按子类别查询
    const subCategories = ['ROUTE_GATE', 'F_ROAD_NODE', 'RIVER_CROSSING', 'GAS_STATION', 'HUT', 'SCENIC', 'HIKING', 'HOT_SPRING', 'SAFETY', 'INFO_SOURCE'];
    
    for (const subCat of subCategories) {
      const count = await prisma.place.count({
        where: {
          cityId: icelandCity.id,
          metadata: {
            path: ['subCategory'],
            equals: subCat,
          },
        },
      });
      if (count > 0) {
        console.log(`  • ${subCat}: ${count} 个`);
      }
    }
    
    console.log('');
    console.log('✅ 导入完成！');
    console.log('');
    console.log('💡 使用提示:');
    console.log('  • 查询高地POI: GET /places?metadata.subCategory=F_ROAD_NODE');
    console.log('  • 查询河流穿越: GET /places?metadata.subCategory=RIVER_CROSSING');
    console.log('  • 查询山屋: GET /places?metadata.subCategory=HUT');

  } catch (error) {
    console.error('❌ 导入过程中出错:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// ============================================
// 主函数
// ============================================
async function main() {
  console.log('🚀 开始执行冰岛高地F路POI导入脚本...\n');
  
  try {
    await importHighlandPois();
  } catch (error: any) {
    console.error(`\n❌ 致命错误: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

main().catch(console.error);
