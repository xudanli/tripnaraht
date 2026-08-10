/**
 * Stored Initial Plan Proposal repository — deliberately separate from PlanVersion.
 * No Apply / PlanVersion write APIs.
 */

import { Injectable } from '@nestjs/common';
import type { StoredInitialPlanProposal } from '../types/iceland-trip-shell-preview.types';

@Injectable()
export class IcelandStoredProposalRepository {
  private readonly byId = new Map<string, StoredInitialPlanProposal>();
  private readonly byTrip = new Map<string, string[]>();
  /** ownerId::tripId::contextVersion::idempotencyKey → proposalId */
  private readonly idempotency = new Map<string, string>();
  /** Spy for write-safety tests — always 0 for PlanVersion */
  planVersionWriteCount = 0;

  put(row: StoredInitialPlanProposal): void {
    this.byId.set(row.proposalId, row);
    const list = this.byTrip.get(row.tripId) ?? [];
    if (!list.includes(row.proposalId)) list.push(row.proposalId);
    this.byTrip.set(row.tripId, list);
    if (row.idempotencyKey) {
      this.idempotency.set(
        this.idemKey(row.tripId, row.contextVersion, row.idempotencyKey),
        row.proposalId,
      );
    }
  }

  get(proposalId: string): StoredInitialPlanProposal | undefined {
    return this.byId.get(proposalId);
  }

  listForTrip(tripId: string): StoredInitialPlanProposal[] {
    return (this.byTrip.get(tripId) ?? [])
      .map((id) => this.byId.get(id))
      .filter((x): x is StoredInitialPlanProposal => Boolean(x));
  }

  getByIdempotency(
    tripId: string,
    contextVersion: number,
    idempotencyKey: string,
  ): StoredInitialPlanProposal | undefined {
    const id = this.idempotency.get(this.idemKey(tripId, contextVersion, idempotencyKey));
    return id ? this.byId.get(id) : undefined;
  }

  markStaleExcept(tripId: string, keepProposalId: string, contextVersion: number): void {
    for (const row of this.listForTrip(tripId)) {
      if (row.proposalId === keepProposalId) continue;
      if (row.contextVersion < contextVersion || row.status !== 'STALE') {
        if (row.proposalId !== keepProposalId && row.contextVersion !== contextVersion) {
          this.byId.set(row.proposalId, {
            ...row,
            status: row.contextVersion < contextVersion ? 'STALE' : 'SUPERSEDED',
          });
        }
      }
    }
  }

  markAllStaleForTrip(tripId: string, exceptProposalId?: string): void {
    for (const row of this.listForTrip(tripId)) {
      if (row.proposalId === exceptProposalId) continue;
      if (row.status === 'STALE' || row.status === 'SUPERSEDED' || row.status === 'APPLIED') {
        continue;
      }
      this.byId.set(row.proposalId, { ...row, status: 'SUPERSEDED' });
    }
  }

  count(): number {
    return this.byId.size;
  }

  private idemKey(tripId: string, contextVersion: number, key: string): string {
    return `${tripId}::v${contextVersion}::${key}`;
  }
}
