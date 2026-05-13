/**
 * Decision Ledger DAG — 可失效决策图（与 AgentMemoryContext 装配对齐的 v0 契约）。
 * 输入只存指纹；重算顺序由 planLedgerRecomputeOrder 给出。
 */

import type { WorldTopicSlice } from './world-topic-slice.types';

export type LedgerActionType =
  | 'ROUTE_DIRECTION'
  | 'TRANSPORT'
  | 'ACCOMMODATION'
  | 'POI'
  | 'LOGISTICS'
  | 'WORLD';

export type LedgerNodeStatus = 'STABLE' | 'STALE' | 'INVALIDATED';

/** 世界锚：粗粒度（大局）与细粒度（价格/余票等）分离，避免细抖动全图 INVALIDATED */
export interface WorldAnchorV1 {
  coarseDigest: string;
  fineDigest: string;
  activeTopics: Record<string, string>;
}

export interface InputSignaturesV1 {
  budgetAnchor: string;
  preferenceAnchor: string;
  /** 与 LedgerAnchorsV1.world 对齐的序列化 digest（= serializeWorldAnchorComposite(worldLayered)） */
  worldAnchor: string;
  policyAnchor?: string;
  /** 参与 FINE/COARSE 精准失效的 topic 集合（缺省则退回单一 worldAnchor 比对） */
  observedWorldTopics?: string[];
  /** 决策提交时各 topic 的 digest 快照 */
  worldTopicDigestsAtCommit?: Record<string, string>;
  /** 提交时的 coarseDigest */
  worldCoarseDigestAtCommit?: string;
}

/**
 * 控制某类全局锚变更是否参与根命中。
 * L2 路线投影缺「决策当时」的完整偏好快照，默认仅 budget 参与漂移检测。
 */
export interface LedgerInvalidationPolicyV1 {
  budget?: 'none' | 'normal';
  preference?: 'none' | 'normal';
  world?: 'none' | 'normal';
  policy?: 'none' | 'normal';
}

export interface LedgerOutputRefV1 {
  kind: string;
  payloadDigest: string;
  summary?: string;
}

export interface LedgerNodeLineageV1 {
  snapshotId: string;
  branchId?: string;
}

export interface LedgerNode {
  nodeId: string;
  parentIds: string[];
  consumesNodeIds: string[];
  actionType: LedgerActionType;
  inputSignatures: InputSignaturesV1;
  outputRef: LedgerOutputRefV1;
  status: LedgerNodeStatus;
  createdAt: number;
  lineage?: LedgerNodeLineageV1;
  invalidationPolicy?: LedgerInvalidationPolicyV1;
}

export interface LedgerEdgeV1 {
  from: string;
  to: string;
  kind: 'parent' | 'consumes' | 'caused_by';
}

export interface LedgerAnchorsV1 {
  budget: string;
  preference: string;
  policy: string;
  /** 序列化世界锚（向后兼容、与旧节点 worldAnchor 对齐） */
  world: string;
  worldLayered: WorldAnchorV1;
}

export interface DecisionLedgerSnapshot {
  revision: 'v1';
  nodes: LedgerNode[];
  edges: LedgerEdgeV1[];
  anchors: LedgerAnchorsV1;
  /** 装配时参与 digest 的世界切片（可观测 / 调试） */
  worldSlices?: WorldTopicSlice[];
  /** TTL 判定为过期的 topic 名（不自动改 digest；严格相位下可升级为失效根） */
  staleWorldTopics?: string[];
}

export type LedgerConstraintChange =
  | { kind: 'BUDGET'; newBudgetAnchor: string }
  | { kind: 'PREFERENCE'; newPreferenceAnchor: string }
  | { kind: 'WORLD'; newWorldLayered: WorldAnchorV1 }
  | { kind: 'POLICY'; newPolicyAnchor: string };

export interface LedgerInvalidationResult {
  ledger: DecisionLedgerSnapshot;
  invalidatedNodeIds: string[];
  staleNodeIds: string[];
}

export interface LedgerRecomputePlanV1 {
  revision: 'v1';
  orderedNodeIds: string[];
  /** 存在环或无法解析依赖时的节点（仍应被调度重算，顺序不保证） */
  unorderedFallbackNodeIds: string[];
}
