/**
 * In-memory atomic OCC simulator for UWC-1c concurrency proofs.
 * Demonstrates compare-and-swap + idempotency-before-freshness without DB writes.
 */

import {
  evaluateAtomicOccDecision,
  type ExpectedWriteVersion,
  type ObservedWriteVersion,
  type OccDecision,
} from './expected-write-version';

type VersionState = {
  planVersionId: string | null;
  resources: Map<string, string>;
};

type IdemRecord = { status: 'APPLIED' | 'FAILED'; result?: OccDecision };

/**
 * Single-mutex atomic writer — no check-then-write gap between callers
 * that await tryAtomicWrite sequentially or under the internal lock.
 */
export class OccAtomicWriteSimulator {
  private readonly state: VersionState = {
    planVersionId: null,
    resources: new Map(),
  };
  private readonly idempotency = new Map<string, IdemRecord>();
  private chain: Promise<void> = Promise.resolve();

  seedPlanVersion(planVersionId: string): void {
    this.state.planVersionId = planVersionId;
  }

  seedResource(resourceId: string, version: string | number): void {
    this.state.resources.set(resourceId, String(version));
  }

  snapshotObserved(expected: ExpectedWriteVersion): ObservedWriteVersion {
    if (expected.kind === 'PLAN_VERSION') {
      return {
        kind: 'PLAN_VERSION',
        observedPlanVersionId: this.state.planVersionId,
      };
    }
    if (expected.kind === 'RESOURCE_VERSION_SET') {
      return {
        kind: 'RESOURCE_VERSION_SET',
        resources: expected.resources.map((r) => ({
          resourceId: r.resourceId,
          observedVersion: this.state.resources.has(r.resourceId)
            ? this.state.resources.get(r.resourceId)!
            : null,
        })),
      };
    }
    return { kind: 'NO_VERSION_REQUIRED' };
  }

  /**
   * Atomically: read observed → idempotency → freshness → mutate OR conflict.
   */
  async tryAtomicWrite(input: {
    idempotencyKey: string;
    expected: ExpectedWriteVersion;
    /** Optional bump values applied only on PROCEED */
    nextPlanVersionId?: string;
    nextResourceVersions?: ReadonlyArray<{ resourceId: string; version: string | number }>;
  }): Promise<OccDecision> {
    return new Promise((resolve) => {
      this.chain = this.chain.then(async () => {
        const prior = this.idempotency.get(input.idempotencyKey);
        const observed = this.snapshotObserved(input.expected);
        const decision = evaluateAtomicOccDecision({
          idempotencyKey: input.idempotencyKey,
          prior: prior
            ? { key: input.idempotencyKey, status: prior.status }
            : null,
          expected: input.expected,
          observed,
        });

        if (decision.decision === 'ALREADY_APPLIED') {
          resolve(decision);
          return;
        }
        if (decision.decision !== 'PROCEED') {
          resolve(decision);
          return;
        }

        // Mutate under same critical section
        if (input.expected.kind === 'PLAN_VERSION' && input.nextPlanVersionId) {
          this.state.planVersionId = input.nextPlanVersionId;
        }
        if (input.expected.kind === 'RESOURCE_VERSION_SET' && input.nextResourceVersions) {
          for (const r of input.nextResourceVersions) {
            this.state.resources.set(r.resourceId, String(r.version));
          }
        } else if (input.expected.kind === 'RESOURCE_VERSION_SET') {
          for (const r of input.expected.resources) {
            const cur = Number(r.expectedVersion);
            const next = Number.isFinite(cur) ? String(cur + 1) : `${r.expectedVersion}:next`;
            this.state.resources.set(r.resourceId, next);
          }
        }

        this.idempotency.set(input.idempotencyKey, {
          status: 'APPLIED',
          result: decision,
        });
        resolve(decision);
      });
    });
  }
}
