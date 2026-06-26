/**
 * 级联传播置信度衰减 — 每跳按固定系数衰减，避免无限级联等权传播。
 * 参照 KDD 2025 风险可控级联：影响置信度随传播深度递减。
 */

export const CASCADE_CONFIDENCE_DECAY_PER_HOP = 0.85;
export const MIN_CASCADE_CONFIDENCE = 0.2;
export const DEFAULT_CASCADE_PROPAGATION_DEPTH_LIMIT = 2;

export function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return MIN_CASCADE_CONFIDENCE;
  return Math.max(0, Math.min(1, value));
}

/** hopDepth=0 为根节点（无衰减）；每增加一跳乘以 DECAY_PER_HOP。 */
export function decayCascadeConfidence(rootConfidence: number, hopDepth: number): number {
  const root = clampConfidence(rootConfidence);
  if (hopDepth <= 0) return root;
  const decayed = root * CASCADE_CONFIDENCE_DECAY_PER_HOP ** hopDepth;
  return Math.max(MIN_CASCADE_CONFIDENCE, decayed);
}

export function withCascadeHop<T extends Record<string, unknown>>(
  node: T,
  rootConfidence: number,
  hopDepth: number,
): T & { cascadeConfidence: number; propagationHop: number } {
  return {
    ...node,
    cascadeConfidence: decayCascadeConfidence(rootConfidence, hopDepth),
    propagationHop: hopDepth,
  };
}

export interface PropagationNodeState {
  depth: number;
  confidence: number;
}

/**
 * 有界 BFS 传播，返回每个受影响节点的深度与衰减后置信度。
 */
export function propagateWithConfidence(
  seed: Set<string>,
  edges: Array<{ from: string; to: string }>,
  rootConfidence: number,
  depthLimit = DEFAULT_CASCADE_PROPAGATION_DEPTH_LIMIT,
): Map<string, PropagationNodeState> {
  const states = new Map<string, PropagationNodeState>();
  for (const id of seed) {
    states.set(id, { depth: 0, confidence: decayCascadeConfidence(rootConfidence, 0) });
  }

  let frontier = new Set(seed);
  for (let depth = 0; depth < depthLimit; depth++) {
    const next = new Set<string>();
    const hopDepth = depth + 1;
    for (const edge of edges) {
      if (!frontier.has(edge.from) || states.has(edge.to)) continue;
      states.set(edge.to, {
        depth: hopDepth,
        confidence: decayCascadeConfidence(rootConfidence, hopDepth),
      });
      next.add(edge.to);
    }
    frontier = next;
    if (frontier.size === 0) break;
  }

  return states;
}
