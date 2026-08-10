/**
 * Memory Context Package — Agent / Decision 实际消费的记忆视图，不是 DB dump。
 */

import type { AuthorityResolveResult } from './authority-hierarchy.types';
import type { MemoryFieldView } from './memory-event.types';
import type { MemoryNeed } from './memory-need.types';
import type { MemoryContractV1 } from './memory-contract.types';
import type { WorkingMemorySnapshot } from './memory-layers.types';
import type { DecisionEpisodeV1 } from '../episode/decision-episode.types';
import type { MemoryExplainableContextV1 } from './memory-explainability.types';

export type UserProfileMemoryView = {
  pace?: MemoryFieldView<string>;
  riskTolerance?: MemoryFieldView<string>;
  accommodationMovement?: MemoryFieldView<string>;
  preferredExperience?: MemoryFieldView<string[]>;
  planningStyle?: MemoryFieldView<string>;
  extras?: Record<string, MemoryFieldView>;
};

export type TripMemoryView = {
  tripId: string;
  tripGoal?: MemoryFieldView<string>;
  paceOverride?: MemoryFieldView<string>;
  nightDriving?: MemoryFieldView<string>;
  maxDailyDrivingMinutes?: MemoryFieldView<number>;
  temporaryConstraints?: MemoryFieldView<unknown[]>;
  participants?: MemoryFieldView<Record<string, unknown>>;
  extras?: Record<string, MemoryFieldView>;
};

export type DecisionHistoryView = {
  similarDecisions: DecisionEpisodeV1[];
};

export type SemanticEvidenceItem = {
  text: string;
  score?: number;
  sourceRef?: string;
  scope?: string;
};

export type MemoryConflict = AuthorityResolveResult;

export type MemoryContextPackage = {
  schemaId: 'tripnara.memory_context_package@v1';
  task: string;
  tripId?: string | null;
  day?: number | null;
  builtAt: string;
  working?: WorkingMemorySnapshot | null;
  structured: UserProfileMemoryView;
  tripMemory: TripMemoryView | null;
  relevantEpisodes: DecisionEpisodeV1[];
  semanticEvidence: SemanticEvidenceItem[];
  conflicts: MemoryConflict[];
  missingMemory: MemoryNeed[];
  /** 本次装载所遵守的合同（审计 / 防万能上下文） */
  contract: MemoryContractV1;
  /**
   * 可解释投影：facts / preferences / episodes / confidence / evidence / conflicts
   * 供 Decision Trace 与「为什么」回答引用。
   */
  memoryContext: MemoryExplainableContextV1;
  /** Runtime 已过滤：无 CANDIDATE 进入决策上下文 */
  decisionSafe?: boolean;
  /** 设计原则锚点（可观测 / 文档） */
  designPrinciple: string;
};
