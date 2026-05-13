import { ResearchTeamBusService, ResearchTeamBusTimeoutError } from './research-team-bus.service';

describe('ResearchTeamBusService', () => {
  it('isolates assignments by requestId', async () => {
    const bus = new ResearchTeamBusService();
    const seenA: string[] = [];
    const seenB: string[] = [];
    bus.subscribeAssignments('req-a', (e) => seenA.push(e.slotId));
    bus.subscribeAssignments('req-b', (e) => seenB.push(e.slotId));
    bus.publishAssignment('req-a', 's1', { k: 1 });
    bus.publishAssignment('req-b', 's2', { k: 2 });
    await new Promise((r) => setImmediate(r));
    expect(seenA).toEqual(['s1']);
    expect(seenB).toEqual(['s2']);
    bus.finalizeRequest('req-a');
    bus.finalizeRequest('req-b');
  });

  it('waitForSlot resolves matching slotId only', async () => {
    const bus = new ResearchTeamBusService();
    const p = bus.waitForSlot('r1', 'hotel-1', 5000);
    await new Promise((r) => setImmediate(r));
    bus.publishCompletion('r1', 'flight-1', { ok: true });
    bus.publishCompletion('r1', 'hotel-1', { ok: true, detail: { x: 1 } });
    await expect(p).resolves.toEqual({ ok: true, detail: { x: 1 } });
    bus.finalizeRequest('r1');
  });

  it('waitForSlot rejects on timeout', async () => {
    const bus = new ResearchTeamBusService();
    await expect(bus.waitForSlot('r2', 'x', 20)).rejects.toBeInstanceOf(ResearchTeamBusTimeoutError);
    bus.finalizeRequest('r2');
  });

  it('finalizeRequest removes listeners so late completion is ignored', async () => {
    const bus = new ResearchTeamBusService();
    const received: string[] = [];
    bus.subscribeAssignments('r3', () => received.push('hit'));
    bus.finalizeRequest('r3');
    bus.publishAssignment('r3', 's', {});
    await new Promise((r) => setImmediate(r));
    expect(received).toEqual([]);
  });

  it('publishAssignment notifies global subscribers with requestId', async () => {
    const bus = new ResearchTeamBusService();
    const keys: string[] = [];
    bus.subscribeGlobalAssignments((e) => keys.push(`${e.requestId}:${e.slotId}`));
    bus.publishAssignment('rg', 'slot-a', { x: 1 });
    await new Promise((r) => setImmediate(r));
    expect(keys).toEqual(['rg:slot-a']);
  });
});
