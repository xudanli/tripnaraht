import { Injectable, NotFoundException } from '@nestjs/common';
import type { PlanProposal, PlanProposalStatus } from '../types/plan-proposal.types';

const DEFAULT_TTL_MS = 30 * 60 * 1000;

interface StoredProposal {
  proposal: PlanProposal;
  expiresAtMs: number;
}

@Injectable()
export class PlanProposalStoreService {
  private readonly proposals = new Map<string, StoredProposal>();
  private readonly tripIndex = new Map<string, Set<string>>();

  save(proposal: PlanProposal, ttlMs = DEFAULT_TTL_MS): PlanProposal {
    const expiresAtMs = Date.now() + ttlMs;
    const stored: StoredProposal = { proposal, expiresAtMs };
    this.proposals.set(proposal.proposalId, stored);

    const ids = this.tripIndex.get(proposal.tripId) ?? new Set<string>();
    ids.add(proposal.proposalId);
    this.tripIndex.set(proposal.tripId, ids);

    return proposal;
  }

  get(proposalId: string): PlanProposal | null {
    this.evictExpired();
    const stored = this.proposals.get(proposalId);
    if (!stored) return null;
    if (stored.expiresAtMs <= Date.now()) {
      this.delete(proposalId);
      return null;
    }
    return stored.proposal;
  }

  require(proposalId: string): PlanProposal {
    const proposal = this.get(proposalId);
    if (!proposal) {
      throw new NotFoundException(`规划草案 ${proposalId} 不存在或已过期`);
    }
    return proposal;
  }

  listByTrip(tripId: string, statuses?: PlanProposalStatus[]): PlanProposal[] {
    this.evictExpired();
    const ids = this.tripIndex.get(tripId);
    if (!ids) return [];

    const allowed = statuses ? new Set(statuses) : null;
    return [...ids]
      .map((id) => this.proposals.get(id)?.proposal)
      .filter((p): p is PlanProposal => {
        if (!p) return false;
        return allowed ? allowed.has(p.status) : true;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  updateStatus(proposalId: string, status: PlanProposalStatus): PlanProposal {
    const proposal = this.require(proposalId);
    proposal.status = status;
    this.proposals.set(proposalId, {
      proposal,
      expiresAtMs: Date.now() + DEFAULT_TTL_MS,
    });
    return proposal;
  }

  delete(proposalId: string): void {
    const stored = this.proposals.get(proposalId);
    if (stored) {
      const ids = this.tripIndex.get(stored.proposal.tripId);
      ids?.delete(proposalId);
    }
    this.proposals.delete(proposalId);
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const [id, stored] of this.proposals.entries()) {
      if (stored.expiresAtMs <= now) {
        this.delete(id);
      }
    }
  }
}
