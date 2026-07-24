import { NotFoundException } from '@nestjs/common';
import { AutomationAuthorizationService } from './automation-authorization.service';
import type { UserAutomationTemplateStore } from './user-automation-template.store';

describe('AutomationAuthorizationService', () => {
  const registry = {
    list: jest.fn(),
    patchContract: jest.fn(),
  };
  const travelStatus = {
    getTravelStatus: jest.fn(),
  };
  const prisma = {
    trip: {
      findUnique: jest.fn(),
    },
  };
  const userTemplateStore = {
    get: jest.fn(),
    upsert: jest.fn(),
    reset: jest.fn(),
  };

  let service: AutomationAuthorizationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AutomationAuthorizationService(
      prisma as never,
      registry as never,
      travelStatus as never,
      userTemplateStore as unknown as UserAutomationTemplateStore,
    );
  });

  it('getView aggregates contract, travel-status and user template', async () => {
    registry.list.mockResolvedValue({
      contract: { automation: { defaultLevel: 'SUGGEST' } },
      meta: { constraintsVersion: 2 },
    });
    travelStatus.getTravelStatus.mockResolvedValue({
      automation: { paused: false, scope: 'TRIP' },
      aiCompletedWork: { items: [] },
      monitoring: { activeCount: 0, items: [] },
      openDecisions: { count: 0, headline: '', items: [] },
    });
    prisma.trip.findUnique.mockResolvedValue({
      metadata: { travelDecisionContract: { automationScope: 'TRIP' } },
    });
    userTemplateStore.get.mockResolvedValue(undefined);

    const view = await service.getView('trip-1', 'user-1');

    expect(view.tripId).toBe('trip-1');
    expect(view.constraintsVersion).toBe(2);
    expect(view.scope).toBe('TRIP');
    expect(view.travelStatus.automation).toEqual({ paused: false, scope: 'TRIP' });
  });

  it('save with USER_TEMPLATE persists template then patches trip contract', async () => {
    registry.list.mockResolvedValue({
      contract: { automation: { defaultLevel: 'AUTO_REPAIR_LOW_RISK' } },
      meta: { constraintsVersion: 3 },
    });
    travelStatus.getTravelStatus.mockResolvedValue({
      automation: { paused: false, scope: 'USER_TEMPLATE' },
      aiCompletedWork: { items: [] },
      monitoring: { activeCount: 0, items: [] },
      openDecisions: { count: 0, headline: '', items: [] },
    });
    prisma.trip.findUnique.mockResolvedValue({ metadata: {} });
    userTemplateStore.upsert.mockResolvedValue({
      automationPaused: false,
      automation: { defaultLevel: 'AUTO_REPAIR_LOW_RISK' },
    });
    userTemplateStore.get.mockResolvedValue({
      automationPaused: false,
      automation: { defaultLevel: 'AUTO_REPAIR_LOW_RISK' },
    });
    registry.patchContract.mockResolvedValue(undefined);

    await service.save('trip-1', 'user-1', {
      scope: 'USER_TEMPLATE',
      constraintsVersion: 3,
      automation: { defaultLevel: 'AUTO_REPAIR_LOW_RISK' },
    });

    expect(userTemplateStore.upsert).toHaveBeenCalled();
    expect(registry.patchContract).toHaveBeenCalledWith(
      'trip-1',
      'user-1',
      expect.objectContaining({
        automationScope: 'USER_TEMPLATE',
        automation: { defaultLevel: 'AUTO_REPAIR_LOW_RISK' },
      }),
    );
  });

  it('setPaused patches automationPaused only', async () => {
    registry.list.mockResolvedValue({
      contract: {},
      meta: { constraintsVersion: 1 },
    });
    travelStatus.getTravelStatus.mockResolvedValue({
      automation: { paused: true },
      aiCompletedWork: { items: [] },
      monitoring: { activeCount: 0, items: [] },
      openDecisions: { count: 0, headline: '', items: [] },
    });
    prisma.trip.findUnique.mockResolvedValue({ metadata: {} });
    userTemplateStore.get.mockResolvedValue(undefined);

    await service.setPaused('trip-1', 'user-1', true, 1);

    expect(registry.patchContract).toHaveBeenCalledWith('trip-1', 'user-1', {
      constraintsVersion: 1,
      automationPaused: true,
    });
  });

  it('getView throws when trip missing', async () => {
    registry.list.mockResolvedValue({ contract: {}, meta: { constraintsVersion: 0 } });
    travelStatus.getTravelStatus.mockResolvedValue({});
    prisma.trip.findUnique.mockResolvedValue(null);
    userTemplateStore.get.mockResolvedValue(undefined);

    await expect(service.getView('missing', 'user-1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
