/** PRD 3.13 — 拼团前置决策与协同任务飞轮 Schema */

export const PRE_MATCH_DECISION_VERSION = 'pre_match_decision_v1' as const;
export const COLLABORATIVE_TASK_FLYWHEEL_VERSION = 'collaborative_task_flywheel_v1' as const;

export type SceneRoleAnchorId =
  | 'blind_box_follower'
  | 'hardcore_executor'
  | 'co_planning_deputy'
  | 'atmosphere_energizer'
  | 'safety_blueprint_owner';

export interface PreMatchNoiseDriver {
  factorId: string;
  label: string;
  weight: number;
}

export interface PreMatchDecisionBriefView {
  version: typeof PRE_MATCH_DECISION_VERSION;
  hardMetricsPass: boolean;
  inTripCollaborationNoisePercent: number;
  noiseDrivers: PreMatchNoiseDriver[];
  suggestedSceneRoleAnchor: SceneRoleAnchorId | null;
  suggestedSceneRoleLabel: string | null;
  mitigatingTaskTemplateIds: string[];
  /** 队长审批卡片单行展示 */
  narrativeLine: string | null;
  /** PRD 3.14 — 体能拟合度透镜（Layer 0 通过者） */
  physicalFitnessReport?: import('./physical-fitness-gate.types').PhysicalFitnessFitReportView | null;
}

export type CollaborativeTaskStatus = 'pending' | 'confirmed' | 'rolled_back' | 'timed_out';

export type CollaborativeTaskPriority = 'critical' | 'high' | 'normal';

export interface CollaborativeTaskView {
  taskId: string;
  templateId: string;
  title: string;
  description: string;
  assigneeUserId: string;
  assigneeRoleLabel: string;
  priority: CollaborativeTaskPriority;
  status: CollaborativeTaskStatus;
  triggeredBy: {
    vibeChipIds: string[];
    milestoneIds: string[];
  };
  /** Phase 2：confirm / rollback 行为捕获 */
  behaviorCaptureEnabled: boolean;
  /** Phase 2 — 行为时间戳与修订计数 */
  revisionCount?: number;
  confirmedAt?: string | null;
  rolledBackAt?: string | null;
  lastEventAt?: string | null;
  lastActorUserId?: string | null;
  responseLatencyMs?: number | null;
}

export type CollaborativeTaskBehaviorAction = 'confirm' | 'rollback' | 'ack_timeout';

export interface CollaborativeTaskBehaviorEventView {
  eventId: string;
  taskId: string;
  action: CollaborativeTaskBehaviorAction;
  actorUserId: string;
  at: string;
  note?: string | null;
  revisionCountAfter: number;
  responseLatencyMs?: number | null;
}

export interface CollaborativeTaskListView {
  tripId: string;
  flywheel: CollaborativeTaskDispatchPlan;
  tasks: CollaborativeTaskView[];
  behaviorLog: CollaborativeTaskBehaviorEventView[];
}

export interface CollaborativeTaskEventResultView {
  tripId: string;
  task: CollaborativeTaskView;
  event: CollaborativeTaskBehaviorEventView;
  dnaScheduled: boolean;
}

export interface CollaborativeTaskDispatchPlan {
  version: typeof COLLABORATIVE_TASK_FLYWHEEL_VERSION;
  recruitmentPostId: string;
  tasks: CollaborativeTaskView[];
  dispatchedAt: string | null;
}

export interface CollaborativeTaskPreviewView {
  canDispatch: boolean;
  blockReason: string | null;
  plan: CollaborativeTaskDispatchPlan;
}
