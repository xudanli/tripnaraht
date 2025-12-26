// src/route-directions/interfaces/route-direction-explanation.interface.ts
/**
 * RouteDirection 可解释性接口
 */

export interface ScoreBreakdown {
  tagMatch: {
    score: number; // 0-100
    weight: number; // 权重（如 0.4）
    matchedTags: string[]; // 匹配的标签
    totalTags: number; // 总标签数
  };
  seasonality: {
    score: number; // 0-100
    weight: number; // 权重（如 0.3）
    isBestMonth: boolean; // 是否最佳月份
    isAvoidMonth: boolean; // 是否禁忌月份
    month: number; // 月份
  };
  pace: {
    score: number; // 0-100
    weight: number; // 权重（如 0.2）
    userPace: string; // 用户节奏
    routePace: string; // 路线节奏
    compatible: boolean; // 是否兼容
  };
  risk: {
    score: number; // 0-100
    weight: number; // 权重（如 0.1）
    userTolerance: string; // 用户风险承受度
    routeRisk: string; // 路线风险等级
    compatible: boolean; // 是否兼容
  };
}

export interface MatchedSignals {
  tags: {
    matched: string[]; // 匹配的标签
    unmatched: string[]; // 未匹配的标签
    routeTags: string[]; // 路线所有标签
  };
  seasonality: {
    month: number;
    bestMonths: number[];
    avoidMonths: number[];
    monthWeight?: number; // 月份权重（如果有）
  };
  pace: {
    userPace: string;
    routePace: string;
    compatibility: 'high' | 'medium' | 'low';
  };
  risk: {
    userTolerance: string;
    routeHasHighRisk: boolean;
    riskFactors: string[]; // 风险因素列表
  };
}

export interface RejectedReason {
  routeDirectionId: number;
  routeDirectionName: string;
  score: number;
  primaryReason: string; // 主要淘汰原因
  details: {
    tagMatch?: { score: number; reason: string };
    seasonality?: { score: number; reason: string };
    pace?: { score: number; reason: string };
    risk?: { score: number; reason: string };
  };
}

export interface RouteDirectionExplanation {
  selected: {
    routeDirectionId: number;
    routeDirectionName: string;
    score: number;
    scoreBreakdown: ScoreBreakdown;
    matchedSignals: MatchedSignals;
    reasons: string[]; // 推荐理由
    version?: string; // 版本号
  };
  alternatives: {
    top3: Array<{
      routeDirectionId: number;
      routeDirectionName: string;
      score: number;
      reasons: string[];
      version?: string; // 版本号
    }>;
    rejected: RejectedReason[]; // Top 4-6 被淘汰的原因
    deprecated?: Array<{
      routeDirectionId: number;
      routeDirectionName: string;
      score: number;
      reasons: string[];
      status: 'deprecated';
      version?: string; // 版本号
    }>; // 备选曾经方案（deprecated 的 RD）
  };
  whyNotOthers?: {
    topAlternative?: {
      routeDirectionId: number;
      routeDirectionName: string;
      whyNot: string; // 为什么没有选择它
      scoreDifference: number; // 分数差异
    };
    commonReasons?: string[]; // 其他路线被淘汰的常见原因
  };
}

