// src/route-directions/interfaces/route-direction-explainer.interface.ts
/**
 * RouteDirection Explainer Interface
 * 
 * 路线方向说明卡 - 让 RouteDirection 变成可解释、可对外讲、可运营的产品资产
 */

/**
 * 地形画像
 */
export interface TerrainProfile {
  avgElevation: number; // 平均海拔（米）
  elevationRange: {
    min: number; // 最低海拔（米）
    max: number; // 最高海拔（米）
  };
  typicalSlope: number; // 典型坡度（%）
  totalAscent?: number; // 总爬升（米）
  totalDescent?: number; // 总下降（米）
  difficultyLevel?: 'EASY' | 'MODERATE' | 'CHALLENGING' | 'EXTREME'; // 难度等级
}

/**
 * 风险画像
 */
export interface RiskProfileExplainer {
  altitude: {
    level: 'none' | 'low' | 'medium' | 'high'; // 高反风险等级
    maxElevation: number; // 最高海拔（米）
    daysAbove3000m?: number; // 连续超过 3000m 的天数
    description?: string; // 风险描述
  };
  weather: {
    level: 'stable' | 'variable' | 'unpredictable' | 'extreme'; // 天气风险等级
    weatherWindow?: boolean; // 是否有天气窗口限制
    weatherWindowMonths?: number[]; // 天气窗口月份
    description?: string; // 风险描述
  };
  isolation: {
    level: 'urban' | 'accessible' | 'remote' | 'very_remote'; // 隔离程度
    nearestHospitalKm?: number; // 最近医院距离（公里）
    cellCoverage?: 'good' | 'partial' | 'poor' | 'none'; // 手机信号覆盖
    description?: string; // 风险描述
  };
  other?: {
    roadClosure?: boolean; // 封路风险
    ferryDependent?: boolean; // 是否依赖渡轮
    permitRequired?: boolean; // 是否需要许可
    guideRequired?: boolean; // 是否需要向导
    [key: string]: any;
  };
}

/**
 * 路线方向说明卡
 */
export interface RouteDirectionExplainer {
  id: number; // RouteDirection ID
  uuid: string; // RouteDirection UUID
  title: string; // 标题（英文）
  titleCN: string; // 标题（中文）
  tagline: string; // 一句话（用于 UI / 分享）
  description: string; // 150~300 字详细描述
  suitableFor: string[]; // 适合人群/场景
  notSuitableFor: string[]; // 不适合人群/场景
  bestMonths: number[]; // 最佳月份（1-12）
  avoidMonths?: number[]; // 禁忌月份（1-12）
  terrainProfile: TerrainProfile; // 地形画像
  riskProfile: RiskProfileExplainer; // 风险画像
  keywords?: string[]; // 关键词（如 "Sherpa / 茶屋 / 冰川谷地"）
  culturalHighlights?: string[]; // 文化亮点
  signatureExperiences?: string[]; // 标志性体验
  typicalDuration?: {
    min: number; // 最短天数
    max: number; // 最长天数
    recommended: number; // 推荐天数
  };
  entryPoints?: string[]; // 入口点
  exitPoints?: string[]; // 出口点
  metadata?: {
    version?: string; // 版本号
    lastUpdated?: string; // 最后更新时间
    source?: string; // 数据来源
    [key: string]: any;
  };
}

