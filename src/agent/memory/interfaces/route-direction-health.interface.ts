// src/agent/memory/interfaces/route-direction-health.interface.ts

/**
 * L3: 路线健康记忆（RouteDirectionHealth）
 * 
 * 系统级智慧沉淀：哪些路线常失败、哪些常成功
 */

export interface RouteDirectionHealth {
  routeDirectionId: number;
  countryCode: string;

  totalRuns: number;
  successRuns: number;
  failureRuns: number;

  commonFailureReasons: string[];
  commonRepairs: string[];

  lastUpdated: Date;
}

/**
 * 计算路线健康度（0~1）
 */
export function calculateRouteDirectionHealthScore(health: RouteDirectionHealth): number {
  if (health.totalRuns === 0) {
    return 0.5; // 无数据时返回中性值
  }

  const successRate = health.successRuns / health.totalRuns;
  
  // 失败原因惩罚
  const failurePenalty = health.commonFailureReasons.length * 0.1;
  
  // 修复频率惩罚（修复越多，健康度越低）
  const repairPenalty = health.commonRepairs.length * 0.05;

  return Math.max(0, Math.min(1, successRate - failurePenalty - repairPenalty));
}

