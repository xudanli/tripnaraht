// src/route-directions/fixtures/TEMPLATE.fixture.ts
/**
 * RouteDirection Fixture 模板
 * 
 * 使用说明：
 * 1. 复制此文件并重命名为 {country_code}_{route_name}.fixture.ts
 *    例如：jp_kumano_kodo.fixture.ts, nz_milford_track.fixture.ts
 * 2. 替换所有 TODO 标记的内容
 * 3. 删除不需要的可选字段
 * 4. 在 index.ts 中导出新的 fixture
 * 
 * 命名规范：
 * - 文件名：{国家代码小写}_{路线名称小写}.fixture.ts
 * - 导出名：{国家代码大写}_{路线名称大写}（下划线分隔）
 * - 哲学模型：{国家代码大写}_{路线名称大写}_PHILOSOPHY
 */

import { RouteDirectionData } from '../interfaces/route-direction.interface';
import { RoutePhilosophy } from '../../trips/decision/models/route-philosophy.model';

// ============================================================================
// 第一步：定义路线哲学模型
// ============================================================================
/**
 * TODO: 定义路线哲学
 * 
 * 核心问题：
 * 1. 这条路线的本质是什么？（coreStatement）
 * 2. 用户必须体验什么？（mustVisitTags）
 * 3. 什么是绝对不能妥协的？（nonNegotiableRules）
 * 4. 什么是可以灵活调整的？（flexibleParts）
 */
export const TEMPLATE_ROUTE_PHILOSOPHY: RoutePhilosophy = {
  // 核心陈述：一句话描述路线的本质（10-20字）
  coreStatement: 'TODO: 用一句话描述这条路线的核心体验',
  
  // 必须体验标签：Neptune 不允许删除的体验类型（3-5个）
  mustVisitTags: [
    'TODO: 核心体验1',
    'TODO: 核心体验2',
    'TODO: 核心体验3',
  ],
  
  // 不可协商规则：绝对不能打破的红线（3-5条）
  nonNegotiableRules: [
    'TODO: 规则1 - 必须做什么',
    'TODO: 规则2 - 必须包含什么',
    'TODO: 规则3 - 必须满足什么条件',
  ],
  
  // 可灵活调整部分：Neptune 可以动手脚的局部（3-5项）
  flexibleParts: [
    'TODO: 灵活项1 - 可选的路线/方向',
    'TODO: 灵活项2 - 可替换的住宿/POI',
    'TODO: 灵活项3 - 可调整的天数/节奏',
  ],
  
  // 天数弹性区间
  durationFlexibility: {
    minDays: 7,      // TODO: 最少天数
    maxDays: 14,     // TODO: 最多天数
    preferredDays: 10, // TODO: 推荐天数
  },
};

// ============================================================================
// 第二步：定义完整的 RouteDirection
// ============================================================================
export const TEMPLATE_ROUTE: RouteDirectionData = {
  // --------------------------------------------------------------------------
  // 基本信息（必填）
  // --------------------------------------------------------------------------
  name: 'TEMPLATE_ROUTE',           // TODO: 路线唯一标识（大写下划线）
  nameCN: 'TODO: 中文名称',          // TODO: 中文名称
  countryCode: 'XX',                // TODO: ISO 3166-1 alpha-2 国家代码
  tags: [                           // TODO: 路线标签（用于搜索和分类）
    '标签1',
    '标签2', 
    '标签3',
  ],
  
  // --------------------------------------------------------------------------
  // 地理信息（推荐填写）
  // --------------------------------------------------------------------------
  regions: [                        // TODO: 涉及的区域
    'Region1',
    'Region2',
  ],
  entryHubs: [                      // TODO: 入口枢纽（机场/城市）
    'Hub1',
    'Hub2',
  ],
  
  // --------------------------------------------------------------------------
  // 季节性（必填）
  // --------------------------------------------------------------------------
  seasonality: {
    bestMonths: [6, 7, 8, 9],       // TODO: 最佳月份（1-12）
    avoidMonths: [12, 1, 2],        // TODO: 避免月份（1-12）
  },
  
  // --------------------------------------------------------------------------
  // 约束条件（必填）
  // --------------------------------------------------------------------------
  constraints: {
    // 硬约束：违反必须修复
    hard: {
      maxDailyRapidAscentM: 500,    // TODO: 每日快速爬升上限（米）
      rapidAscentForbidden: false,  // TODO: 是否禁止快速爬升
      requiresGuide: false,         // TODO: 是否必须向导
      requiresPermit: false,        // TODO: 是否需要许可证
    },
    // 软约束：尽量满足
    soft: {
      maxElevationM: 3000,          // TODO: 最高海拔（米）
      maxDailyAscentM: 500,         // TODO: 建议每日爬升（米）
      bufferTimeMin: 60,            // TODO: 缓冲时间（分钟）
    },
    // 目标函数权重
    objectives: {
      preferViewpoints: 0.3,        // TODO: 观景点偏好权重
      preferPhotography: 0.3,       // TODO: 摄影偏好权重
      preferCulture: 0.2,           // TODO: 文化体验偏好权重
      preferNature: 0.2,            // TODO: 自然体验偏好权重
    },
  },
  
  // --------------------------------------------------------------------------
  // 代表性 POI（推荐填写）
  // --------------------------------------------------------------------------
  signaturePois: {
    examples: [                     // TODO: POI UUID 或标识符
      'poi_1',
      'poi_2',
      'poi_3',
    ],
    weights: {                      // TODO: POI 权重（0-1，越大越重要）
      poi_1: 1.0,
      poi_2: 0.9,
      poi_3: 0.8,
    },
  },
  
  // --------------------------------------------------------------------------
  // 失败画像（必填 - 非常重要！）
  // --------------------------------------------------------------------------
  failureProfile: {
    commonFailureDays: [3, 4, 5],   // TODO: 常见失败日期（从1开始）
    typicalFailureReason: [         // TODO: 典型失败原因
      'weather',    // 天气
      'fatigue',    // 疲劳
      'altitude',   // 高反
      'logistics',  // 后勤问题
    ],
    rescueDifficulty: 'MEDIUM',     // TODO: 救援难度 'LOW' | 'MEDIUM' | 'HIGH'
    failureScenarios: [             // TODO: 详细失败场景（至少2-3个）
      {
        day: 3,
        reason: 'TODO: 第3天可能出现的问题',
        typicalUserProfile: 'TODO: 容易出问题的用户画像',
        mitigation: 'TODO: 缓解措施和建议',
      },
      {
        day: 4,
        reason: 'TODO: 第4天可能出现的问题',
        typicalUserProfile: 'TODO: 容易出问题的用户画像',
        mitigation: 'TODO: 缓解措施和建议',
      },
      // 添加更多场景...
    ],
  },
  
  // --------------------------------------------------------------------------
  // 路线叙事（必填）
  // --------------------------------------------------------------------------
  narrative: {
    // 内部叙事：用于决策解释（给系统看）
    internal: 'TODO: 描述路线的核心假设和内部逻辑',
    // 用户面向叙事：用于用户教育（给用户看）
    userFacing: 'TODO: 描述路线的特点和适合人群',
    // 哲学简述
    philosophy: 'TODO: 一句话哲学（与 coreStatement 一致）',
  },
  
  // --------------------------------------------------------------------------
  // 不适合用户画像（必填）
  // --------------------------------------------------------------------------
  antiPersona: [                    // TODO: 不适合这条路线的用户类型
    '不适合用户类型1',
    '不适合用户类型2',
    '不适合用户类型3',
  ],
  
  // --------------------------------------------------------------------------
  // 顶层哲学字段（必填）
  // --------------------------------------------------------------------------
  philosophy: TEMPLATE_ROUTE_PHILOSOPHY,
  
  // --------------------------------------------------------------------------
  // 风险画像（推荐填写）
  // --------------------------------------------------------------------------
  riskProfile: {
    altitudeSickness: false,        // TODO: 是否有高反风险
    roadClosure: false,             // TODO: 是否有道路封闭风险
    ferryDependent: false,          // TODO: 是否依赖渡轮
    weatherWindow: true,            // TODO: 是否有天气窗口限制
    weatherWindowMonths: [6, 7, 8], // TODO: 天气窗口月份
    level: 'medium',                // TODO: 风险等级 'low' | 'medium' | 'high'
  },
  
  // --------------------------------------------------------------------------
  // 元数据（必填）
  // --------------------------------------------------------------------------
  metadata: {
    // 路线类型
    routeType: 'ROAD_TRIP',         // TODO: 'ROAD_TRIP' | 'TREKKING' | 'ADVENTURE_DRIVE' | 'CYCLING'
    
    // 基础数据
    totalDistanceKm: 500,           // TODO: 总距离（公里）
    estimatedDuration: 10,          // TODO: 推荐天数
    
    // 车辆/装备要求（如适用）
    vehicleRequired: 'standard',    // TODO: 'standard' | '4x4' | 'none'
    
    // 特殊要求标记
    // TODO: 根据路线类型添加相关标记
    // fRoadForbidden: true,        // F路禁止
    // riverCrossing: true,         // 需要过河
    // teaHouseAvailable: true,     // 有茶屋
    // campingRequired: true,       // 需要露营
    // porterRecommended: true,     // 建议背夫
    // guideRecommended: true,      // 建议向导
    
    // 用于测试的 ID
    testId: 'TEMPLATE_ROUTE',
    
    // 完整的哲学模型（冗余备份）
    philosophy: TEMPLATE_ROUTE_PHILOSOPHY,
  },
};

// ============================================================================
// 第三步：在 index.ts 中添加导出
// ============================================================================
/*
在 src/route-directions/fixtures/index.ts 中添加：

// 导入
export { TEMPLATE_ROUTE, TEMPLATE_ROUTE_PHILOSOPHY } from './template.fixture';

// 添加到 ALL_ROUTE_DIRECTION_FIXTURES 数组
import { TEMPLATE_ROUTE } from './template.fixture';

export const ALL_ROUTE_DIRECTION_FIXTURES: RouteDirectionData[] = [
  IS_HIGHLANDS_F_ROAD_EXPEDITION,
  IS_RING_ROAD,
  NP_EBC_TREK,
  TEMPLATE_ROUTE,  // <-- 添加这行
];
*/
