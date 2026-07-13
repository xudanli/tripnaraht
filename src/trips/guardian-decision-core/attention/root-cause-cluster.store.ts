/**
 * In-memory RootCauseCluster store — Shadow / harness scaffold.
 */

import type { RootCauseCluster } from '../contracts/attention-orchestration.types';

export class RootCauseClusterStore {
  private byKey = new Map<string, RootCauseCluster>();
  private byId = new Map<string, RootCauseCluster>();

  getByRootCauseKey(rootCauseKey: string): RootCauseCluster | undefined {
    return this.byKey.get(rootCauseKey);
  }

  getByClusterId(clusterId: string): RootCauseCluster | undefined {
    return this.byId.get(clusterId);
  }

  listByTripId(tripId: string): RootCauseCluster[] {
    return [...this.byKey.values()].filter((c) => c.tripId === tripId);
  }

  listAll(): RootCauseCluster[] {
    return [...this.byKey.values()];
  }

  save(cluster: RootCauseCluster): RootCauseCluster {
    this.byKey.set(cluster.rootCauseKey, cluster);
    this.byId.set(cluster.clusterId, cluster);
    return cluster;
  }

  clear(): void {
    this.byKey.clear();
    this.byId.clear();
  }
}

export function createClusterId(rootCauseKey: string): string {
  return `cluster_${rootCauseKey.replace(/[^a-zA-Z0-9]+/g, '_')}`;
}
