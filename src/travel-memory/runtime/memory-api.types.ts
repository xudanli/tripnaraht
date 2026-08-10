/**
 * V1 Memory API 合同（P0）。
 */

import type { MemoryContextPackage } from '../types/memory-context-package.types';
import type { DecisionEpisodeV1 } from '../episode/decision-episode.types';
import type {
  UserProfileMemoryView,
  TripMemoryView,
} from '../types/memory-context-package.types';
import type { MemoryEventV1 } from '../types/memory-event.types';
import type { MemoryScope, MemorySubject } from '../types/memory-scope.types';
import type { MemorySourceType, MemoryType } from '../types/memory-event.types';
import type { MemoryContractV1 } from '../types/memory-contract.types';

export type BuildContextRequest = {
  task: string;
  tripId?: string | null;
  userId?: string | null;
  day?: number | null;
  creOperation?: string | null;
  messageHint?: string | null;
  /**
   * 可选：显式 Memory Contract。
   * 缺省时由 Memory Need Planner 生成；禁止无合同全量装载。
   */
  contract?: MemoryContractV1;
  /** 可选：已组装的相关 Episode（由调用方注入，避免 Runtime 直连 DB） */
  episodes?: DecisionEpisodeV1[];
  /** Reality 提示：如今日疲劳高 */
  worldHints?: {
    driverFatigueHigh?: boolean;
  };
  working?: MemoryContextPackage['working'];
};

export type WriteCandidateRequest = {
  subject: MemorySubject;
  memoryType: MemoryType;
  predicate: string;
  value: unknown;
  scope: MemoryScope;
  sourceType: MemorySourceType;
  confidence?: number;
  explicitConfirm?: boolean;
  validFrom?: string;
  conversationId?: string;
  turnId?: string;
  decisionId?: string;
  episodeId?: string;
};

export type WriteCandidateResult =
  | { ok: true; event: MemoryEventV1 }
  | { ok: false; reason: string; keepEpisodeOnly?: boolean };

export type ConfirmMemoryRequest = {
  subject: MemorySubject;
  predicate: string;
  value: unknown;
  scope: MemoryScope;
  supersedesEventId?: string | null;
};

export type InvalidateMemoryRequest = {
  subject: MemorySubject;
  predicate: string;
  scope: MemoryScope;
  targetEventId: string;
  reason?: string;
};

export type TravelMemoryApi = {
  getProfile(userId: string): UserProfileMemoryView;
  getTripMemory(tripId: string): TripMemoryView;
  getRelevantDecisions(input: {
    decisionType?: string;
    tripId?: string;
    scope?: 'USER' | 'TRIP';
    episodes?: DecisionEpisodeV1[];
    limit?: number;
  }): DecisionEpisodeV1[];
  searchSemantic(query: string): { items: Array<{ text: string }> };
  writeCandidate(req: WriteCandidateRequest): WriteCandidateResult;
  confirm(req: ConfirmMemoryRequest): MemoryEventV1;
  invalidate(req: InvalidateMemoryRequest): MemoryEventV1;
  buildContext(req: BuildContextRequest): MemoryContextPackage;
};
