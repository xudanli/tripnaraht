import type { EnvironmentState } from '../../../decision/kernel/decision-state.types';
import type { ResearchAssetScope } from '../../utils/research-asset-scope.util';
import type { ResearchConflictNegotiationReport } from './research-conflict-negotiation.types';

/**
 * MAT 3.0：Research Team 内部审计（谁调度谁、耗时）。
 * 与 DSO / OrchestratorState 解耦，供日志、Harness、未来 BFF 选用。
 */
export type ResearchTeamAuditEntry = {
  at: string;
  member: string;
  action: string;
  duration_ms: number;
  /** 窄化上下文摘要，避免把整份 ctx 塞进日志 */
  detail?: Record<string, unknown>;
};

/**
 * Leader.run() 产出：与 IResearchExecutor.execute 对齐，并附加 team 审计。
 * `researchData` 内可含 `__research_asset_manifest` 等现有契约，此处不拆平行 manifest 字段。
 */
export type ResearchTeamResult = {
  researchData: Record<string, unknown>;
  environmentPatch: Partial<EnvironmentState>;
  teamAuditLog: ResearchTeamAuditEntry[];
  /** EBP 冲突协商摘要：供 Kernel / Narrator / BFF；同时写入 `research_data.__research_conflict_negotiation` */
  conflictNegotiation?: ResearchConflictNegotiationReport;
};

/** 从 PhaseExecutorContext 窄化出的队级状态（Master DSO 不持有） */
export type ResearchTeamState = {
  requestId: string;
  researchMode: 'full' | 'transport_only' | 'scoped_partial' | undefined;
  researchScopesToRecompute: ResearchAssetScope[] | undefined;
  hasPriorResearchData: boolean;
  hasRollbackSnapshot: boolean;
};
