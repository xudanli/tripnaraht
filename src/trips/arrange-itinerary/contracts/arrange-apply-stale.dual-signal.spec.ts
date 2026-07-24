/**
 * CC-1 — Arrange apply stale dual-signal behavior.
 */
import { ConflictException } from '@nestjs/common';
import { PlanningOrchestratorFacadeService } from '../services/planning-orchestrator-facade.service';
import type { PlanProposal } from '../types/plan-proposal.types';
import {
  ARRANGE_APPLY_STALE_DUAL_SIGNAL,
  ARRANGE_APPLY_STALE_HTTP_ERROR_CODE,
  ARRANGE_APPLY_STALE_ORCHESTRATION_PHASE,
  ARRANGE_APPLY_STALE_PROPOSAL_STATUS,
} from './arrange-apply-stale.dual-signal.constants';

function baseProposal(overrides: Partial<PlanProposal> = {}): PlanProposal {
  return {
    proposalId: 'prop-1',
    tripId: 'trip-1',
    intent: 'OPTIMIZE_ROUTE',
    status: 'AWAITING_CONFIRMATION',
    basePlanVersion: 1,
    contextVersion: 10,
    affectedDays: [1],
    changes: [
      {
        operation: 'MOVE',
        itemId: 'item-1',
        dayIndex: 1,
        startTime: '10:00',
        endTime: '11:00',
      },
    ],
    validation: { status: 'PASS', warnings: [], conflicts: [] },
    benefits: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: 'u1',
    ...overrides,
  } as PlanProposal;
}

describe('arrange-apply-stale.dual-signal (CC-1)', () => {
  it('documents dual-signal constants', () => {
    expect(ARRANGE_APPLY_STALE_ORCHESTRATION_PHASE).toBe('CONTEXT_STALE');
    expect(ARRANGE_APPLY_STALE_HTTP_ERROR_CODE).toBe('CONTEXT_VERSION_CONFLICT');
    expect(ARRANGE_APPLY_STALE_DUAL_SIGNAL).toContain('CONTEXT_STALE');
    expect(ARRANGE_APPLY_STALE_DUAL_SIGNAL).toContain('CONTEXT_VERSION_CONFLICT');
  });

  it('client contextVersion mismatch → phase CONTEXT_STALE + CONTEXT_VERSION_CONFLICT', async () => {
    const proposal = baseProposal({ contextVersion: 10 });
    const store = {
      require: jest.fn().mockReturnValue(proposal),
      updateStatus: jest.fn().mockImplementation((_id: string, status: string) => {
        proposal.status = status as PlanProposal['status'];
        return proposal;
      }),
    };
    const context = {
      snapshot: jest.fn().mockResolvedValue({ contextVersion: 12 }),
      isStale: jest.fn().mockReturnValue(false),
    };
    const facade = new PlanningOrchestratorFacadeService(
      store as any,
      context as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(
      facade.applyProposal({
        proposalId: 'prop-1',
        userId: 'u1',
        contextVersion: 10,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    try {
      await facade.applyProposal({
        proposalId: 'prop-1',
        userId: 'u1',
        contextVersion: 10,
      });
    } catch (e) {
      const err = e as ConflictException;
      expect(err.getStatus()).toBe(409);
      const body = err.getResponse() as Record<string, unknown>;
      expect(body.code).toBe(ARRANGE_APPLY_STALE_HTTP_ERROR_CODE);
      expect(body.errorCode).toBe(ARRANGE_APPLY_STALE_HTTP_ERROR_CODE);
      expect(body.currentContextVersion).toBe(12);
    }

    expect(store.updateStatus).toHaveBeenCalledWith(
      'prop-1',
      ARRANGE_APPLY_STALE_PROPOSAL_STATUS,
    );
    expect(facade.getOrchestrationState('trip-1').phase).toBe(
      ARRANGE_APPLY_STALE_ORCHESTRATION_PHASE,
    );
    expect(context.isStale).not.toHaveBeenCalled();
  });

  it('proposal-bound stale via isStale → same dual signal', async () => {
    const proposal = baseProposal({ contextVersion: 8 });
    const store = {
      require: jest.fn().mockReturnValue(proposal),
      updateStatus: jest.fn().mockImplementation((_id: string, status: string) => {
        proposal.status = status as PlanProposal['status'];
        return proposal;
      }),
    };
    const context = {
      snapshot: jest.fn().mockResolvedValue({ contextVersion: 11 }),
      isStale: jest.fn().mockReturnValue(true),
    };
    const facade = new PlanningOrchestratorFacadeService(
      store as any,
      context as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(
      facade.applyProposal({
        proposalId: 'prop-1',
        userId: 'u1',
        // omit client contextVersion → second branch
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    const state = facade.getOrchestrationState('trip-1');
    expect(state.phase).toBe(ARRANGE_APPLY_STALE_ORCHESTRATION_PHASE);
    expect(state.activeProposalId).toBe('prop-1');
    expect(store.updateStatus).toHaveBeenCalledWith(
      'prop-1',
      ARRANGE_APPLY_STALE_PROPOSAL_STATUS,
    );
    expect(context.isStale).toHaveBeenCalledWith(8, { contextVersion: 11 });
  });
});
