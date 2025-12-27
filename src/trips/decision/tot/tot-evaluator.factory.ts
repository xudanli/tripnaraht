// src/trips/decision/tot/tot-evaluator.factory.ts

/**
 * ToT 评分器工厂函数
 * 
 * 用于非 NestJS 环境（测试/脚本/纯函数）
 */

import { ToTEvaluatorService } from './tot-evaluator.service';

/**
 * 创建 ToT 评分器实例
 * 
 * 用于非 NestJS 环境，避免直接 new 时缺少依赖
 * 
 * @param deps 依赖项（目前 ToTEvaluatorService 无外部依赖，保留接口以便未来扩展）
 * @returns ToT 评分器实例
 */
export function createToTEvaluator(deps?: {
  // 未来可能需要注入的服务
  // abu?: AbuStrategy;
  // objectiveConfig?: ObjectiveConfigService;
}): ToTEvaluatorService {
  // 目前 ToTEvaluatorService 无外部依赖，直接创建
  // 未来如果有依赖，通过 deps 参数传入
  return new ToTEvaluatorService();
}

