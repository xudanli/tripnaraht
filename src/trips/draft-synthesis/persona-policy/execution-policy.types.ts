/**
 * Policy Engine 输出：注入编排 / 仲裁 / 门控 / 仿真 / 修复回路。
 */
export type SimulationLevel = 'LIGHT' | 'FULL';
export type RepairAggressiveness = 'LOW' | 'MEDIUM' | 'HIGH';
export type GateProfile = 'SOFT' | 'STANDARD' | 'STRICT';

export interface ExecutionPolicy {
  llmWeight: number;
  algoWeight: number;
  solverWeight: number;

  simulationLevel: SimulationLevel;
  repairAggressiveness: RepairAggressiveness;

  /** 约束冲突时的优先级（前者优先），用于 Trace / 后续 Repair 插件 */
  constraintPriorityOrder: string[];

  gateProfile: GateProfile;
}
