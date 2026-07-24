import type {
  OdysseyDimensionPercents,
  OdysseyRawScores,
  MbtiQuadrant,
} from '../../odyssey-intake/types/odyssey-intake.types';
import type { VerifiedCredentialsView } from '../../odyssey-intake/types/verified-credentials.types';
import type { VibeBehavioralContractView, VibeLlmParseView, VibeLlmPostView } from './vibe-llm.types';
import type { TrekkingVibeOrchestrationPlan } from './trekking-vibe-orchestration.types';
import type { TrekkingSpawnResultView } from './trekking-spawn.types';
import type { TripInstantiationResultView } from './trip-instantiation.types';

export type RecruitmentPostStatus = 'active' | 'hidden' | 'closed';

export type TravelMode = 'self_drive' | 'public_transit' | 'mixed' | 'other';

export type TripMoodTag = 'relax' | 'adventure' | 'healing' | 'social';

/** PRD 3.4.4 — 组队共事风格 / 责任边界三档 */
export type RecruitmentPlanningStyle = 'full_managed' | 'co_planning' | 'casual_play';
export type TeamworkStyle = RecruitmentPlanningStyle;

/** 发布时快照，供列表契合度计算无需回查 Profile */
export interface CaptainPersonaSnapshot {
  mbtiType: string;
  cardTitle: string;
  interactionMode: string;
  interactionModeLabel: string;
  quadrant: MbtiQuadrant;
  rawScores: OdysseyRawScores;
  dimensionPercents: OdysseyDimensionPercents;
  reputationStars?: number | null;
}

export interface MatchSquareAccess {
  canBrowse: boolean;
  canPost: boolean;
  canApply: boolean;
  quizComplete: boolean;
}

/** PRD Match Engine v2 — 前端契合度抽屉行 */
export interface MatchInsightDrawerLineView {
  status: 'ok' | 'warn' | 'neutral';
  label: string;
  detail: string;
}

export interface MatchInsightDrawerView {
  headline: string;
  lines: MatchInsightDrawerLineView[];
}

/** PRD Match Engine v2 — 双层撮合得分明细 */
export interface StructuralMatchBreakdownView {
  baseScore: number;
  teamworkFitPoints: number;
  stressFitPoints: number;
  mbtiSynergyPoints: number;
  chemistryScriptPoints?: number;
  industryAntiClusterPoints?: number;
  chemistryScriptId?: string;
  chemistryScriptTitle?: string;
  algorithm: string;
}

export interface RecruitmentPostCardView {
  id: string;
  status: RecruitmentPostStatus;
  captainUserId: string;
  captainCardTitle: string;
  captainMbtiType: string;
  captainInteractionMode: string;
  captainInteractionModeLabel: string;
  captainReputationStars: number | null;
  compatibilityPercent: number | null;
  /** PRD Match Engine v2 — 点击契合度气泡展开的麦肯锡式抽屉 */
  matchInsightDrawer?: MatchInsightDrawerView | null;
  /** PRD Match Engine v2 — 算法分层明细（运维/调试） */
  structuralMatch?: StructuralMatchBreakdownView | null;
  /** PRD 3.5.1 — 组队风格 Hard Gate 熔断时为 true */
  teamworkMatchBlocked: boolean;
  teamworkBlockReason: string | null;
  /** 队长履约 Hard Gate — 对非队长浏览者隐藏推荐 */
  recommendationHidden: boolean;
  recommendationHiddenReason: string | null;
  /** PRD 3.1.2 — 身份背书资产（列表 headline + 详情 dossier） */
  verifiedCredentials: VerifiedCredentialsView | null;
  destination: string;
  departureLabel: string | null;
  startDate: string;
  endDate: string;
  teamStatus: {
    slotsFilled: number;
    slotsNeeded: number;
    slotsRemaining: number;
  };
  /** PRD 3.7.1 — 拼图化缺位展示，替代纯数字「缺 N 人」 */
  teamPuzzle: TeamPuzzleView;
  /** PRD 4.3 — Vibe LLM 动态标签与契约提示 */
  vibeLlm?: VibeLlmPostView | null;
  captainMessage: string | null;
  /** PRD 4.3 — 招募愿景小作文（有 Vibe 发布时等于 vibeLlm.visionText） */
  recruitmentVision: string | null;
  itinerarySummary: string;
  budgetRange: { minCents: number | null; maxCents: number | null } | null;
  tripMoodTag: TripMoodTag | null;
  /** 组队共事风格 id（同 planningStyle） */
  teamworkStyle: TeamworkStyle | null;
  /** 列表胶囊：🛡️ 组队风格：全托管 */
  teamworkStyleCapsule: string | null;
  /** @deprecated 使用 teamworkStyle */
  planningStyle: RecruitmentPlanningStyle | null;
  planningStyleLabel: string | null;
  planningStyleDescription: string | null;
  travelMode: TravelMode | null;
  publishedAt: string | null;
}

export interface RecruitmentPostDetailView extends RecruitmentPostCardView {
  /** PRD 4.3 — 发布时落库的 parse 快照（GET 原样回显） */
  vibeParse: VibeLlmParseView | null;
  /** PRD 3.10 — Premium Trekking → TripNARA 编排计划 */
  trekkingOrchestration: TrekkingVibeOrchestrationPlan | null;
  /** PRD 3.10 Phase 2 — 已成功 spawn 的 Trip 结果 */
  trekkingSpawnResult: TrekkingSpawnResultView | null;
  /** PRD 3.12 — 成团后 Active Trip 实例化结果 */
  tripInstantiationResult: TripInstantiationResultView | null;
  /** PRD 3.11 链路 A — 从路线模板发起招募时的强绑定信息 */
  routeTemplateBinding: import('./route-template-launch-recruitment.types').RouteTemplateBindingView | null;
  /** PRD 3.15 — 队长强制成团锁死记录（已执行时非 null） */
  sovereignLock: import('./sovereign-force-lock.types').SovereignForceLockRecord | null;
  preferenceNotes: string | null;
  vehicleInfo: string | null;
  destinationLat: number | null;
  destinationLng: number | null;
  destinationPoiId: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  isCaptain: boolean;
}

export interface FilterOptionsView {
  personaQuadrants: Array<{ id: MbtiQuadrant; label: string }>;
  personaTypes: Array<{ id: string; label: string }>;
  interactionModes: Array<{ id: string; label: string }>;
  tripMoodTags: Array<{ id: TripMoodTag; label: string }>;
  planningStyles: Array<{ id: RecruitmentPlanningStyle; label: string; description: string }>;
  /** PRD 3.4.4 — 与 planningStyles 相同，推荐前端使用此字段名 */
  teamworkStyles: Array<{
    id: TeamworkStyle;
    label: string;
    productName: string;
    description: string;
    boundary: string;
    algorithmMapping: string;
    contractCapsule: string;
  }>;
  travelModes: Array<{ id: TravelMode; label: string }>;
  /** 发布表单 — 目的地大区 / 细分范围（与 vibe parse suggestedFields 对齐） */
  destinationRegions: Array<{
    id: string;
    label: string;
    subScopes: Array<{ id: string; label: string; destinationLabel: string }>;
  }>;
  /** Premium Trekking — 与左侧 🏃 徒步入口及 Vibe 剧本 id 对齐 */
  premiumTrekkingScene: {
    id: string;
    menuId: string;
    label: string;
    description: string;
    scriptIds: string[];
  };
}

export type ApplicationStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn';

export interface PlanningConflictPromptView {
  required: true;
  dimension: 'planning_hardness';
  message: string;
}

export interface TeamworkCommitmentPromptView {
  required: true;
  dimension: 'teamwork_style';
  teamworkStyle: TeamworkStyle;
  message: string;
}

export interface ApplyPreviewView {
  canApply: boolean;
  blockReason?: string;
  conflictPrompt?: PlanningConflictPromptView | null;
  teamworkCommitmentPrompt?: TeamworkCommitmentPromptView | null;
  /** PRD 4.3 — 申请 Bottom Sheet 展示的 LLM 行为契约 */
  vibeBehavioralContracts?: VibeBehavioralContractView[];
  /** PRD 3.14 — Layer 0 体能物理硬约束 */
  physicalFitnessGate?: import('./physical-fitness-gate.types').PhysicalFitnessGateView | null;
  /** Level 4+ 硬核徒步 — 户外生存博弈题（提交时需带答案） */
  physicalSurvivalQuiz?: import('./physical-fitness-gate.types').PhysicalSurvivalQuizQuestionView[];
  teamworkMatchBlocked?: boolean;
  compatibilityPercent?: number | null;
  matchInsightDrawer?: MatchInsightDrawerView | null;
  structuralMatch?: StructuralMatchBreakdownView | null;
  highlights?: string[];
  warnings?: string[];
}

export interface RecruitmentApplicationCardView {
  id: string;
  postId: string;
  status: ApplicationStatus;
  applicantUserId: string;
  applicantDisplayName: string;
  applicantCardTitle: string;
  applicantMbtiType: string;
  applicantInteractionMode: string;
  applicantInteractionModeLabel: string;
  applicantReputationStars: number | null;
  safetyWarning: string | null;
  compatibilityPercent: number;
  highlights: string[];
  warnings: string[];
  /** PRD 3.13 — 决策引擎拼团前置预演（队长审批专用） */
  decisionBrief?: import('./recruitment-task-flywheel.types').PreMatchDecisionBriefView | null;
  message: string;
  planningCommitmentAccepted: boolean;
  teamworkCommitmentAccepted: boolean;
  targetSlotIndex: number | null;
  targetSlotId: string | null;
  targetSlotLabel: string | null;
  createdAt: string;
  decidedAt: string | null;
  /** PRD 3.14 — 队长审批体能拟合透镜 */
  physicalFitnessReport?: import('./physical-fitness-gate.types').PhysicalFitnessFitReportView | null;
  /** PRD 3.1.2 — 申请人只读背书快照（列表/审批兜底） */
  applicantVerifiedCredentials?: ApplicantVerifiedCredentialsView | null;
}

/** 申请卡片内嵌的脱敏背书（不含完整 dossier 实体字段） */
export interface ApplicantVerifiedCredentialsView {
  headline: {
    identityHeadline: string | null;
    trustAssetLine: string | null;
  };
  dossier: {
    displayName: string | null;
    educationTags: string[];
    professionTags: string[];
  };
}

export type TeamPuzzleSlotKind = 'filled' | 'open';

export type PuzzleDeficitDimension =
  | 'energy_balance'
  | 'risk_resilience'
  | 'trust_alignment'
  | 'collaboration_fit'
  | 'cross_circle_chemistry'
  | 'preference';

export interface TeamPuzzleSlotView {
  kind: TeamPuzzleSlotKind;
  slotIndex?: number;
  /** 稳定槽位 id — `puzzle-slot-{n}` 或 Vibe `vibe-slot-{slot_id}` */
  slotId?: string;
  roleLabel: string;
  /** 已填充槽位的用户 id（队长 slotIndex=0 或已通过队员） */
  occupantUserId?: string;
  occupantLabel?: string;
  /** AI 依据（缺位为何需要此类队友） */
  aiRationale?: string;
  deficitDimension?: PuzzleDeficitDimension;
  targetMbtiTypes?: string[];
  highlightForViewer: boolean;
  /** 浏览者与该缺位的匹配分 0–99（登录且完成测评时有值） */
  viewerMatchScore?: number;
}

export interface ViewerPuzzleMatchView {
  isSoulPiece: boolean;
  headline: string;
  matchedSlotIndex: number;
  matchedRoleLabel: string;
  aiRationale: string | null;
}

export interface TeamPuzzleView {
  progressLabel: string;
  /** team_deficit_pomdp_v1 — 队长画像驱动的多智能体缺位规划 */
  algorithm?: string;
  slots: TeamPuzzleSlotView[];
  /** 浏览者恰好命中某一缺位时展示「灵魂拼图」动效 */
  viewerPuzzleMatch?: ViewerPuzzleMatchView | null;
}

export interface MatchFlashCtaView {
  label: string;
  action: 'flash_apply' | 'chat_captain';
}

/** PRD 3.7 — 灵魂旅伴闪送卡（插入广场 feed 第 1–2 张之间） */
export interface MatchFlashCardView {
  kind: 'match_flash';
  postId: string;
  compatibilityPercent: number;
  headline: string;
  aiVerdict: string;
  bullets: string[];
  theme: 'shimmer_gradient';
  ctaPrimary: MatchFlashCtaView;
  ctaSecondary: MatchFlashCtaView;
  insertAfterIndex: number;
}

export type MatchSquareFeedItem =
  | { kind: 'post'; post: RecruitmentPostCardView }
  | { kind: 'match_flash'; flash: MatchFlashCardView };

export type TravelIntentStatus = 'active' | 'paused';

export type TravelIntentBudgetFlex = 'flexible' | 'budget' | 'comfort';

export interface TravelIntentView {
  id: string;
  status: TravelIntentStatus;
  destinationScope: string;
  startDate: string;
  endDate: string;
  budgetFlex: TravelIntentBudgetFlex;
  openToCarpool: boolean;
  note: string | null;
  capabilityTags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CaptainRadarPickView {
  userId: string;
  displayName: string;
  cardTitle: string;
  destinationScope: string;
  compatibilityPercent: number;
  capabilityTags: string[];
  highlights: string[];
  departureLabel: string | null;
}

export interface CaptainRadarView {
  postId: string;
  thresholdPercent: number;
  eligibleCount: number;
  picks: CaptainRadarPickView[];
  systemHint: string | null;
}

export type OliveBranchStatus = 'pending' | 'accepted' | 'declined' | 'expired';

export interface OliveBranchInvitationView {
  id: string;
  postId: string;
  status: OliveBranchStatus;
  captainUserId: string;
  captainCardTitle: string;
  inviteeUserId: string;
  compatibilityPercent: number;
  inviteMessage: string | null;
  radarHighlights: string[];
  postDestination: string;
  postStartDate: string;
  postEndDate: string;
  notificationTitle: string;
  notificationBody: string;
  createdAt: string;
  respondedAt: string | null;
}

/** PRD 3.1.2 — 他人信任档案（详情页 / 队长审批 / 雷达选人） */
export interface UserPublicCredentialsView {
  userId: string;
  cardTitle: string | null;
  mbtiType: string | null;
  verifiedCredentials: VerifiedCredentialsView;
}
