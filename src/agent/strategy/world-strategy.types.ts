/**
 * Strategy Layer：系统级世界原则（长期、与用户无关）。
 * - `WorldStrategyPrinciples`：旧版布尔锚点（仍可供配置摘要）。
 * - `IcelandStrategyDocumentV1`：版本化 JSON 策略源（Gate / 仲裁消费）。
 */

export interface WorldStrategyPrinciples {
  drivingSafetyFirst: boolean;
  avoidNightDrivingInIcelandWinter: boolean;
  prioritizeFeasibleRoutes: boolean;
  neverRecommendIllegalFRoadEntry: boolean;
  trustOfficialSourcesOverUGC: boolean;
}

export type IcelandStrategySeverity = 'CRITICAL' | 'WARNING' | 'INFO';

/** 单条 driving 原则（与 iceland-v1.json 对齐） */
export interface IcelandDrivingPrincipleEntry {
  id: string;
  description: string;
  severity?: IcelandStrategySeverity;
  /** 预留：未来可由通用求值器解析；当前由 iceland-strategy-eval.util 硬编码对应关系 */
  condition?: string;
}

export interface IcelandStrategyDocumentV1 {
  region: string;
  version: string;
  principles: {
    driving: Record<string, IcelandDrivingPrincipleEntry>;
  };
}
