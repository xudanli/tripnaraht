import type { LedgerActionType } from './decision-ledger.types';

/**
 * Topic → 受该 topic digest 漂移影响的 actionType。
 * 未列出的 topic：不通过矩阵触发根（避免「蝴蝶效应」）；未知 topic 的 coarse 变更仍由 coarseDigest 全图路径处理。
 */
export const TOPIC_SENSITIVITY_MATRIX: Record<string, LedgerActionType[]> = {
  'telemetry:total_cost_hint': ['TRANSPORT', 'ACCOMMODATION'],
  'world:flight_inventory': ['TRANSPORT'],
  'world:weather_windows': ['POI', 'ROUTE_DIRECTION'],
  'world:visa_policy': ['LOGISTICS', 'WORLD'],
  'world:wdma_archive': ['WORLD', 'ROUTE_DIRECTION', 'TRANSPORT', 'LOGISTICS'],
  'world:trip_constraints': ['ROUTE_DIRECTION', 'ACCOMMODATION', 'LOGISTICS'],
};

export function listChangedWorldTopicKeys(
  oldTopics: Record<string, string>,
  newTopics: Record<string, string>,
): string[] {
  const keys = new Set([...Object.keys(oldTopics), ...Object.keys(newTopics)]);
  return [...keys].filter(k => (oldTopics[k] ?? '') !== (newTopics[k] ?? ''));
}

/** 某 topic 的 digest 变化是否应让该 actionType 的节点进入 WORLD 漂移根集 */
export function topicChangeImpactsActionType(topic: string, actionType: LedgerActionType): boolean {
  const row = TOPIC_SENSITIVITY_MATRIX[topic];
  return Array.isArray(row) && row.includes(actionType);
}

/**
 * 任一变更 topic 命中该节点 actionType 的敏感行时，视为该节点受 WORLD topic 漂移影响。
 * 与 invalidation 中 `changedTopics.some(t => topicChangeImpactsActionType(t, n.actionType))` 语义一致。
 */
export function isTopicChangeImpactingNode(
  node: { actionType: LedgerActionType },
  changedTopics: string[],
): boolean {
  return changedTopics.some(topic => topicChangeImpactsActionType(topic, node.actionType));
}
