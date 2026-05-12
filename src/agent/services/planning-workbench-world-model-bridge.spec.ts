import { Test } from '@nestjs/testing';
import { PlanningWorkbenchAgentService } from './planning-workbench-agent.service';
import { CostAgentService } from './domain-agents/cost-agent.service';
import { ExperienceAgentService } from './domain-agents/experience-agent.service';
import { MultiAgentCollaborationService } from '../../skills/world/services/multi-agent-collaboration.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { PlanContext } from '../../skills/plan/shared/plan-state.types';

/** Integration smoke：Multi-Agent Bridge（jest）；CI 见 world-model-bridge workflow */
describe('PlanningWorkbench world model bridge (tripId)', () => {
  let pw: PlanningWorkbenchAgentService;
  let mac: MultiAgentCollaborationService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        PlanningWorkbenchAgentService,
        CostAgentService,
        ExperienceAgentService,
        MultiAgentCollaborationService,
        { provide: PrismaService, useValue: {} },
      ],
    }).compile();

    pw = moduleRef.get(PlanningWorkbenchAgentService);
    mac = moduleRef.get(MultiAgentCollaborationService);
  });

  const mockContext = (): PlanContext => ({
    destination: { country: 'Iceland', city: 'Reykjavik' },
    days: 7,
    mustDo: ['极光玻璃屋 Aurora glass igloo'],
    constraints: {
      time: {
        days: 7,
        startDate: '2026-12-01',
        endDate: '2026-12-07',
      },
      budget: {
        total: 900,
        currency: 'USD',
      },
      accommodation: {
        level: 'luxury',
      },
    },
  });

  it('getWorldModelData merges consensusSummary onto strategyLayer when MAC registers', async () => {
    const ctx = mockContext();
    const tripId = `jest-bridge-${Date.now()}`;

    const wm = await pw.getWorldModelData(ctx, { tripId });

    expect(wm.collaborationBridge?.registered).toBe(true);
    expect(wm.collaborationBridge?.consensusSummary).toBeTruthy();
    expect(wm.strategyLayer?.consensusSummary).toBe(
      wm.collaborationBridge?.consensusSummary,
    );

    const view = mac.getCollaborationBridgeView(tripId);
    expect(view.strategyLayer?.consensusSummary).toBe(view.consensusSummary);
    expect(wm.strategyLayer?.consensusSummary).toBe(view.consensusSummary);
  });
});
