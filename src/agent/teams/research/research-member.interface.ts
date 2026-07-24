import type { DecisionState } from '../../../decision/kernel/decision-state.types';
import type { PhaseExecutorContext } from '../../../decision/kernel/interfaces/phase-executor.interface';
import type { ResearchAssetScope } from '../../utils/research-asset-scope.util';
import type { UserCognitiveProfile } from '../../memory/experience-replay/user-cognitive-profile.types';
import type { UserEmotionalAccount } from '../../memory/emotional-resonance/user-emotional-account.types';
import type { ResearchBudgetBucket } from './research-team-bus.types';

/**
 * MAT 3.0：Member 执行入参（仅窄化片段；不持有 DSO 写权）。
 * 与当前 Monolith 中 `scoped_partial` commerce 路径对齐，后续可演进为不可变 snapshot。
 */
export type ResearchMemberScopedCommerceInput = {
  requestId: string;
  tripPlanRequest: NonNullable<PhaseExecutorContext['tripPlanRequest']>;
  researchData: Record<string, unknown>;
  evidenceRefs: string[];
  /** 仅住宿域：live refresh 失败时从 COW 快照缝合 */
  researchAtomicRollbackSnapshot?: Record<string, unknown>;
  /** 4.0：Experience Replay 认知侧写；供 Member 在 Skill 调用前注入「Gossip」偏好（无则 3.0 默认） */
  userCognitiveProfile?: UserCognitiveProfile;
  /** 6.x：心理账户快照；高 `frustration_score` 时 Member 切换 `STABILITY_FIRST` Skill 策略 */
  userEmotionalAccount?: UserEmotionalAccount;
  /** 可选：DSO 快照（与并行总线 `ResearchParallelAssignmentPayload.dso` 对齐），供住宿窄轨读取信念/不确定性概要 */
  dso?: DecisionState;
  /** 5.0.1：预算仲裁触发的降级重跑（紧缩 Skill 偏好 / 记录收紧后的桶） */
  budgetRerunHints?: Readonly<{
    austerityMode?: boolean;
    tightenedBudgetBucket?: ResearchBudgetBucket;
  }>;
};

/**
 * 独立 Research Member 契约：Leader / Registry 按 `assetScopes` 调度。
 * 首刀：commerce 轻量刷新；错误策略以内联 try/catch + 日志为主（与 Monolith 一致）。
 */
export interface IResearchMember {
  readonly memberId: string;
  readonly assetScopes: readonly ResearchAssetScope[];
  runScopedCommerce(input: ResearchMemberScopedCommerceInput): Promise<void>;
}
