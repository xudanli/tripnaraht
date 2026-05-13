import type { PhaseExecutorContext } from '../../../decision/kernel/interfaces/phase-executor.interface';
import type { UserCognitiveProfile } from '../../memory/experience-replay/user-cognitive-profile.types';

/** 交通域 Member：`transport.search` 及降级策略（与 Monolith 原 `runTransportSearch` 对齐）。 */
export type ResearchMemberTransportRunInput = {
  requestId: string;
  tripPlanRequest: PhaseExecutorContext['tripPlanRequest'];
  researchData: Record<string, unknown>;
  evidenceRefs: string[];
  /** 4.0：认知侧写；供 Gossip 注入（无则 3.0 默认） */
  userCognitiveProfile?: UserCognitiveProfile;
};
