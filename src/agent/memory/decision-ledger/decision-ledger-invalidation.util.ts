import type {
  DecisionLedgerSnapshot,
  LedgerAnchorsV1,
  LedgerConstraintChange,
  LedgerInvalidationResult,
  LedgerNode,
  LedgerNodeStatus,
  LedgerRecomputePlanV1,
  WorldAnchorV1,
} from './decision-ledger.types';
import type { MemoryLedgerPhaseV1 } from './world-topic-slice.types';
import { serializeWorldAnchorComposite } from './decision-ledger-world-anchor.util';
import {
  isTopicChangeImpactingNode,
  listChangedWorldTopicKeys,
  topicChangeImpactsActionType,
  TOPIC_SENSITIVITY_MATRIX,
} from './ledger-topic-sensitivity.config';

const MISSING = '\u0000';

function isLegacyWorldCompositeDrift(n: LedgerNode, newWorldComposite: string): boolean {
  if ((n.invalidationPolicy?.world ?? 'normal') !== 'normal') return false;
  const obs = n.inputSignatures.observedWorldTopics ?? [];
  const dig = n.inputSignatures.worldTopicDigestsAtCommit;
  const coarseC = n.inputSignatures.worldCoarseDigestAtCommit;
  if (obs.length > 0 && dig && coarseC !== undefined) {
    return false;
  }
  return n.inputSignatures.worldAnchor !== newWorldComposite;
}

/** 节点「提交的世界视图」是否与目标世界锚不一致（用于漂移与显式 WORLD 变更）。 */
export function isWorldDriftRootNodeAgainstTarget(
  n: LedgerNode,
  targetLayered: WorldAnchorV1,
  targetWorldComposite: string,
): boolean {
  const pol = n.invalidationPolicy ?? {};
  if ((pol.world ?? 'normal') !== 'normal') return false;
  const obs = n.inputSignatures.observedWorldTopics ?? [];
  const dig = n.inputSignatures.worldTopicDigestsAtCommit;
  const coarseC = n.inputSignatures.worldCoarseDigestAtCommit;
  if (obs.length > 0 && dig && coarseC !== undefined) {
    if (coarseC !== targetLayered.coarseDigest) return true;
    const driftedTopics = obs.filter(t => (dig[t] ?? MISSING) !== (targetLayered.activeTopics[t] ?? MISSING));
    return isTopicChangeImpactingNode(n, driftedTopics);
  }
  return n.inputSignatures.worldAnchor !== targetWorldComposite;
}

/**
 * 粗 digest 变化 → 全图 world 参与节点入根；否则按 topic 灵敏度矩阵 + legacy composite（无观察契约时）。
 */
export function collectWorldAffectedRoots(
  nodes: LedgerNode[],
  oldAnchor: WorldAnchorV1,
  newAnchor: WorldAnchorV1,
): Set<string> {
  const roots = new Set<string>();
  const coarseChanged = oldAnchor.coarseDigest !== newAnchor.coarseDigest;
  const newComp = serializeWorldAnchorComposite(newAnchor);
  const changedTopics = listChangedWorldTopicKeys(oldAnchor.activeTopics, newAnchor.activeTopics);

  for (const n of nodes) {
    if ((n.invalidationPolicy?.world ?? 'normal') !== 'normal') continue;
    if (coarseChanged) {
      roots.add(n.nodeId);
      continue;
    }
    const dig = n.inputSignatures.worldTopicDigestsAtCommit;
    const coarseC = n.inputSignatures.worldCoarseDigestAtCommit;
    if (dig && coarseC !== undefined && coarseC !== newAnchor.coarseDigest) {
      roots.add(n.nodeId);
      continue;
    }
    if (changedTopics.length > 0) {
      if (isTopicChangeImpactingNode(n, changedTopics)) {
        roots.add(n.nodeId);
        continue;
      }
      if (changedTopics.some(t => !(t in TOPIC_SENSITIVITY_MATRIX)) && isLegacyWorldCompositeDrift(n, newComp)) {
        roots.add(n.nodeId);
        continue;
      }
      continue;
    }
    if (isLegacyWorldCompositeDrift(n, newComp)) {
      roots.add(n.nodeId);
    }
  }
  return roots;
}

function collectTtlStrictWorldRoots(nodes: LedgerNode[], staleTopics: string[]): Set<string> {
  const roots = new Set<string>();
  for (const n of nodes) {
    if ((n.invalidationPolicy?.world ?? 'normal') !== 'normal') continue;
    const obs = n.inputSignatures.observedWorldTopics;
    if (!obs?.length) continue;
    if (obs.some(t => staleTopics.includes(t) && topicChangeImpactsActionType(t, n.actionType))) {
      roots.add(n.nodeId);
    }
  }
  return roots;
}

/** 反向索引：某 nodeId 被哪些节点依赖（出现在 parentIds / consumesNodeIds 中） */
export function buildLedgerDependentsIndex(nodes: LedgerNode[]): Map<string, Set<string>> {
  const dependents = new Map<string, Set<string>>();
  const add = (from: string, to: string) => {
    if (!dependents.has(from)) dependents.set(from, new Set());
    dependents.get(from)!.add(to);
  };
  for (const n of nodes) {
    for (const p of n.parentIds) {
      add(p, n.nodeId);
    }
    for (const c of n.consumesNodeIds) {
      add(c, n.nodeId);
    }
  }
  return dependents;
}

export function collectExplicitConstraintChangeRoots(
  nodes: LedgerNode[],
  change: LedgerConstraintChange,
  ledgerAnchorsBefore: LedgerAnchorsV1,
): Set<string> {
  if (change.kind === 'WORLD') {
    return collectWorldAffectedRoots(nodes, ledgerAnchorsBefore.worldLayered, change.newWorldLayered);
  }
  const roots = new Set<string>();
  for (const n of nodes) {
    const pol = n.invalidationPolicy ?? {};
    if (change.kind === 'BUDGET') {
      if ((pol.budget ?? 'normal') === 'normal' && n.inputSignatures.budgetAnchor !== change.newBudgetAnchor) {
        roots.add(n.nodeId);
      }
    } else if (change.kind === 'PREFERENCE') {
      if ((pol.preference ?? 'normal') === 'normal' && n.inputSignatures.preferenceAnchor !== change.newPreferenceAnchor) {
        roots.add(n.nodeId);
      }
    } else if (change.kind === 'POLICY') {
      if (
        (pol.policy ?? 'normal') === 'normal' &&
        n.inputSignatures.policyAnchor !== undefined &&
        n.inputSignatures.policyAnchor !== change.newPolicyAnchor
      ) {
        roots.add(n.nodeId);
      }
    }
  }
  return roots;
}

/** 将节点与 ledger.anchors 对比，收集漂移根（用于「当前 trip 态 vs 节点记录」） */
export function collectAnchorDriftRoots(nodes: LedgerNode[], anchors: LedgerAnchorsV1): Set<string> {
  const roots = new Set<string>();
  for (const n of nodes) {
    const pol = n.invalidationPolicy ?? {};
    if ((pol.budget ?? 'normal') === 'normal' && n.inputSignatures.budgetAnchor !== anchors.budget) {
      roots.add(n.nodeId);
    }
    if ((pol.preference ?? 'normal') === 'normal' && n.inputSignatures.preferenceAnchor !== anchors.preference) {
      roots.add(n.nodeId);
    }
    if ((pol.policy ?? 'normal') === 'normal' && n.inputSignatures.policyAnchor !== undefined) {
      if (n.inputSignatures.policyAnchor !== anchors.policy) {
        roots.add(n.nodeId);
      }
    }
    if (
      (pol.world ?? 'normal') === 'normal' &&
      isWorldDriftRootNodeAgainstTarget(n, anchors.worldLayered, anchors.world)
    ) {
      roots.add(n.nodeId);
    }
  }
  return roots;
}

function onlyWorldMismatch(n: LedgerNode, anchors: LedgerAnchorsV1): boolean {
  const pol = n.invalidationPolicy ?? {};
  const budgetOk =
    (pol.budget ?? 'normal') !== 'normal' || n.inputSignatures.budgetAnchor === anchors.budget;
  const prefOk =
    (pol.preference ?? 'normal') !== 'normal' || n.inputSignatures.preferenceAnchor === anchors.preference;
  const policyOk =
    (pol.policy ?? 'normal') !== 'normal' ||
    n.inputSignatures.policyAnchor === undefined ||
    n.inputSignatures.policyAnchor === anchors.policy;
  const worldMismatch =
    (pol.world ?? 'normal') === 'normal' && isWorldDriftRootNodeAgainstTarget(n, anchors.worldLayered, anchors.world);
  return budgetOk && prefOk && policyOk && worldMismatch;
}

function cascadeStatusFromSeeds(
  nodes: LedgerNode[],
  seeds: Set<string>,
  mode: 'HARD' | 'SOFT',
): LedgerNode[] {
  const dependents = buildLedgerDependentsIndex(nodes);
  const byId = new Map(nodes.map(n => [n.nodeId, { ...n }]));
  const targetStatus: LedgerNodeStatus = mode === 'HARD' ? 'INVALIDATED' : 'STALE';
  const q = [...seeds];
  const visited = new Set<string>();

  while (q.length) {
    const id = q.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const cur = byId.get(id);
    if (!cur) continue;
    cur.status = targetStatus;
    for (const down of dependents.get(id) ?? []) {
      q.push(down);
    }
  }
  return [...byId.values()];
}

/**
 * 对依赖闭包执行级联 STALE/INVALIDATED（与约束漂移共用同一拓扑引擎）。
 * 用于写回后「上游结果变更 → 下游需重算」等结构性次生失效（v1：不解析具体时刻冲突，仅依赖图）。
 */
export function applyLedgerDependentInvalidationCascade(
  ledger: DecisionLedgerSnapshot,
  seedNodeIds: Iterable<string>,
  mode: 'HARD' | 'SOFT',
): DecisionLedgerSnapshot {
  const seeds = new Set(seedNodeIds);
  if (seeds.size === 0) return ledger;
  const nextNodes = cascadeStatusFromSeeds(ledger.nodes, seeds, mode);
  return { ...ledger, nodes: nextNodes };
}

export type ApplyLedgerConstraintChangeOptions = {
  memoryPhase?: MemoryLedgerPhaseV1;
};

/**
 * 显式约束变更（如新预算水位已确定），更新锚并级联失效。
 */
export function applyLedgerConstraintChange(
  ledger: DecisionLedgerSnapshot,
  change: LedgerConstraintChange,
  options?: ApplyLedgerConstraintChangeOptions,
): LedgerInvalidationResult {
  const anchorsBefore = ledger.anchors;
  const anchors = { ...ledger.anchors };
  if (change.kind === 'BUDGET') anchors.budget = change.newBudgetAnchor;
  if (change.kind === 'PREFERENCE') anchors.preference = change.newPreferenceAnchor;
  if (change.kind === 'WORLD') {
    anchors.worldLayered = change.newWorldLayered;
    anchors.world = serializeWorldAnchorComposite(change.newWorldLayered);
  }
  if (change.kind === 'POLICY') anchors.policy = change.newPolicyAnchor;

  const roots = collectExplicitConstraintChangeRoots(ledger.nodes, change, anchorsBefore);
  const phase = options?.memoryPhase ?? 'PLANNING';
  const mode: 'HARD' | 'SOFT' =
    change.kind === 'WORLD' && phase === 'PLANNING' ? 'SOFT' : 'HARD';
  const nextNodes = cascadeStatusFromSeeds(ledger.nodes, roots, mode);
  const next: DecisionLedgerSnapshot = { ...ledger, anchors, nodes: nextNodes, edges: ledger.edges };

  return {
    ledger: next,
    invalidatedNodeIds: nextNodes.filter(n => n.status === 'INVALIDATED').map(n => n.nodeId),
    staleNodeIds: nextNodes.filter(n => n.status === 'STALE').map(n => n.nodeId),
  };
}

export type InvalidateLedgerByAnchorDriftOptions = {
  memoryPhase?: MemoryLedgerPhaseV1;
};

/**
 * 用当前 ledger.anchors 对比各节点 inputSignatures，标记漂移闭包（无外部 change 事件时的入口）。
 */
export function invalidateLedgerByAnchorDrift(
  ledger: DecisionLedgerSnapshot,
  options?: InvalidateLedgerByAnchorDriftOptions,
): LedgerInvalidationResult {
  const memoryPhase = options?.memoryPhase ?? 'PLANNING';
  const roots = new Set(collectAnchorDriftRoots(ledger.nodes, ledger.anchors));
  if (memoryPhase !== 'PLANNING' && ledger.staleWorldTopics?.length) {
    for (const id of collectTtlStrictWorldRoots(ledger.nodes, ledger.staleWorldTopics)) {
      roots.add(id);
    }
  }
  if (roots.size === 0) {
    return { ledger, invalidatedNodeIds: [], staleNodeIds: [] };
  }
  const worldOnly = [...roots].every(id => {
    const n = ledger.nodes.find(x => x.nodeId === id);
    return n && onlyWorldMismatch(n, ledger.anchors);
  });
  const ttlRootSet = collectTtlStrictWorldRoots(ledger.nodes, ledger.staleWorldTopics ?? []);
  const ttlRootsOnly = roots.size > 0 && [...roots].every(id => ttlRootSet.has(id));

  const mode =
    (worldOnly || ttlRootsOnly) && memoryPhase === 'PLANNING'
      ? 'SOFT'
      : 'HARD';

  const nextNodes = cascadeStatusFromSeeds(ledger.nodes, roots, mode);
  const next: DecisionLedgerSnapshot = { ...ledger, nodes: nextNodes };
  return {
    ledger: next,
    invalidatedNodeIds: nextNodes.filter(n => n.status === 'INVALIDATED').map(n => n.nodeId),
    staleNodeIds: nextNodes.filter(n => n.status === 'STALE').map(n => n.nodeId),
  };
}

/**
 * 仅对 INVALIDATED 节点拓扑排序；依赖在 INVALIDATED 集内的必须先于消费方重算。
 */
export function planLedgerRecomputeOrder(ledger: DecisionLedgerSnapshot): LedgerRecomputePlanV1 {
  const invalidated = ledger.nodes.filter(n => n.status === 'INVALIDATED');
  const idSet = new Set(invalidated.map(n => n.nodeId));
  if (idSet.size === 0) {
    return { revision: 'v1', orderedNodeIds: [], unorderedFallbackNodeIds: [] };
  }

  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const id of idSet) {
    adj.set(id, []);
  }

  for (const n of invalidated) {
    const deps = [...new Set([...n.parentIds, ...n.consumesNodeIds])].filter(x => idSet.has(x));
    inDegree.set(n.nodeId, deps.length);
    for (const d of deps) {
      adj.get(d)!.push(n.nodeId);
    }
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const ordered: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    ordered.push(id);
    for (const to of adj.get(id) ?? []) {
      const nextDeg = (inDegree.get(to) ?? 0) - 1;
      inDegree.set(to, nextDeg);
      if (nextDeg === 0) queue.push(to);
    }
  }

  const fallback = invalidated.map(n => n.nodeId).filter(id => !ordered.includes(id));
  return { revision: 'v1', orderedNodeIds: ordered, unorderedFallbackNodeIds: fallback };
}
