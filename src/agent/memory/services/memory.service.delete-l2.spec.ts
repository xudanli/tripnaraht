import { MemoryService } from './memory.service';

describe('MemoryService.deleteRouteDirectionDecision', () => {
  it('removes in-memory L2 when user matches', async () => {
    const svc = new MemoryService(undefined as any);
    await svc.saveRouteDirectionDecision({
      id: 'dec-1',
      userId: 'u1',
      countryCode: 'IS',
      month: 6,
      selectedRouteDirectionId: 10,
      rejectedRouteDirectionIds: [],
      keyConstraints: {},
      scoreBreakdown: {},
      explanation: { whySelected: 'test', whyRejected: [], riskPoints: [] },
      createdAt: new Date(),
    });
    expect(await svc.deleteRouteDirectionDecision('u1', 'dec-1')).toBe(true);
    expect(await svc.deleteRouteDirectionDecision('u1', 'dec-1')).toBe(false);
    const left = await svc.getUserRouteDirectionDecisions('u1');
    expect(left).toHaveLength(0);
  });
});
