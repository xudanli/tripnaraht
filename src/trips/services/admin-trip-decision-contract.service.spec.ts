import { NotFoundException } from '@nestjs/common';
import { AdminTripDecisionContractService } from './admin-trip-decision-contract.service';
import { ADMIN_TRIP_DECISION_CONTRACT_SCHEMA_ID } from '../dto/admin-trip-decision-contract.dto';

describe('AdminTripDecisionContractService', () => {
  const prisma = {
    trip: { findUnique: jest.fn() },
  };

  const registry = {
    listLightweight: jest.fn(),
  };

  let service: AdminTripDecisionContractService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AdminTripDecisionContractService(prisma as never, registry as never);
  });

  it('throws NotFound when trip missing', async () => {
    prisma.trip.findUnique.mockResolvedValue(null);
    await expect(service.getDecisionContract('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('returns lightweight contract projection using OWNER as context user', async () => {
    prisma.trip.findUnique.mockResolvedValue({
      id: 'trip-1',
      TripCollaborator: [
        { userId: 'member-1', role: 'EDITOR' },
        { userId: 'owner-1', role: 'OWNER' },
      ],
    });
    registry.listLightweight.mockResolvedValue({
      meta: {
        tripId: 'trip-1',
        constraintsVersion: 2,
        total: 1,
        byType: { HARD: 1, SOFT: 0, EXTERNAL: 0 },
        byStatus: { ACTIVE: 1 },
        conflictCount: 0,
        pendingConfirmCount: 0,
        sections: [],
      },
      items: [{ id: 'c_time_range' }],
      contract: {
        schemaId: 'tripnara.travel_decision_contract@v1',
        tripId: 'trip-1',
        constraintsVersion: 2,
        objectives: { rankedPrinciples: ['SAFETY'], version: 1 },
        displayPrinciples: [{ key: 'SAFETY', label: '安全第一', rank: 1 }],
        compiledWeights: { legacy: {}, canonical: {} },
        changeStrategy: { archetype: 'BALANCED', tolerances: {} },
        automation: { defaultLevel: 'SUGGEST', autoAllowed: [], confirmationRequired: [] },
        teamGovernance: { rules: [] },
        conflicts: {
          hasConflicts: false,
          mustHandle: 0,
          suggestAdjust: 0,
          pendingConfirm: 0,
          conflictConstraintIds: [],
        },
      },
    });

    const view = await service.getDecisionContract('trip-1', { conflictOnly: 'true' });

    expect(view.schemaId).toBe(ADMIN_TRIP_DECISION_CONTRACT_SCHEMA_ID);
    expect(view.tripId).toBe('trip-1');
    expect(view.contextUserId).toBe('owner-1');
    expect(view.degraded).toEqual({
      planningConflictsSkipped: true,
      riskActivationSkipped: true,
    });
    expect(view.contract.schemaId).toBe('tripnara.travel_decision_contract@v1');
    expect(view.items).toHaveLength(1);
    expect(registry.listLightweight).toHaveBeenCalledWith('trip-1', 'owner-1', {
      conflictOnly: 'true',
    });
  });

  it('falls back to admin-readonly when trip has no collaborators', async () => {
    prisma.trip.findUnique.mockResolvedValue({
      id: 'trip-orphan',
      TripCollaborator: [],
    });
    registry.listLightweight.mockResolvedValue({
      meta: {
        tripId: 'trip-orphan',
        constraintsVersion: 0,
        total: 0,
        byType: { HARD: 0, SOFT: 0, EXTERNAL: 0 },
        byStatus: {},
        conflictCount: 0,
        pendingConfirmCount: 0,
        sections: [],
      },
      items: [],
      contract: {
        schemaId: 'tripnara.travel_decision_contract@v1',
        tripId: 'trip-orphan',
        constraintsVersion: 0,
        objectives: { rankedPrinciples: [], version: 1 },
        displayPrinciples: [],
        compiledWeights: { legacy: {}, canonical: {} },
        changeStrategy: { archetype: 'BALANCED', tolerances: {} },
        automation: { defaultLevel: 'SUGGEST', autoAllowed: [], confirmationRequired: [] },
        teamGovernance: { rules: [] },
        conflicts: {
          hasConflicts: false,
          mustHandle: 0,
          suggestAdjust: 0,
          pendingConfirm: 0,
          conflictConstraintIds: [],
        },
      },
    });

    const view = await service.getDecisionContract('trip-orphan');
    expect(view.contextUserId).toBeNull();
    expect(registry.listLightweight).toHaveBeenCalledWith('trip-orphan', 'admin-readonly', {});
  });
});
