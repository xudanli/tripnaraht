import type { CandidatePlace } from '../../../services/candidate-retrieval.engine';

/**
 * Topology Layer —— 紧凑候选 + 地理簇 centroids（弱拓扑；Temporal 下一阶段）
 */
export function renderTopologyLayer(candidates: CandidatePlace[]): string {
  const compact = (c: CandidatePlace) => ({
    id: c.id,
    name: c.nameCN,
    cat: c.category,
    lat: Math.round(c.lat * 1e5) / 1e5,
    lng: Math.round(c.lng * 1e5) / 1e5,
    cluster: c.clusterId ?? 0,
  });

  const allCompact = candidates.map(compact);
  const byCluster = new Map<number, CandidatePlace[]>();
  for (const c of candidates) {
    const k = c.clusterId ?? 0;
    if (!byCluster.has(k)) byCluster.set(k, []);
    byCluster.get(k)!.push(c);
  }

  const hints = [...byCluster.entries()]
    .map(([cid, places]) => {
      let la = 0;
      let ln = 0;
      for (const p of places) {
        la += p.lat;
        ln += p.lng;
      }
      const n = places.length;
      return {
        clusterId: cid,
        centroid: {
          lat: Math.round((la / n) * 1e5) / 1e5,
          lng: Math.round((ln / n) * 1e5) / 1e5,
        },
        placeIds: places.map((p) => p.id),
      };
    })
    .sort((a, b) => a.clusterId - b.clusterId);

  return `## 候选地点（紧凑字段：id/name/cat/lat/lng/cluster — 完整列表，勿臆造 id）
${JSON.stringify(allCompact, null, 2)}

## 地理簇拓扑 Topology hints（编排时优先同日同簇串联，跨簇跳转需在 reason/riskTags 中体现不确定性）
${JSON.stringify(hints, null, 2)}`;
}
