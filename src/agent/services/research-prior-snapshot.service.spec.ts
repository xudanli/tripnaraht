import { ResearchPriorSnapshotService } from './research-prior-snapshot.service';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';

describe('ResearchPriorSnapshotService', () => {
  const svc = new ResearchPriorSnapshotService(undefined);

  it('conversationKey prefers meta.conversation_id', () => {
    const req = {
      request_id: 'r1',
      user_id: 'u1',
      message: 'x',
      meta: { conversation_id: '  cid-99  ' },
    } as RouteAndRunRequestDto;
    expect(svc.conversationKey(req)).toBe('conv:cid-99');
  });

  it('conversationKey falls back to trip_id + user_id', () => {
    const req = {
      request_id: 'r1',
      user_id: 'u1',
      message: 'x',
      trip_id: 't42',
    } as RouteAndRunRequestDto;
    expect(svc.conversationKey(req)).toBe('trip:t42:u:u1');
  });

  it('trimForStorage truncates large poi_evidence arrays', () => {
    const pois = Array.from({ length: 150 }, (_, i) => ({ id: `p${i}` }));
    const rd = { poi_evidence: pois, transport_evidence: { ok: true } };
    const out = svc.trimForStorage(rd as any);
    expect(Array.isArray(out.poi_evidence)).toBe(true);
    expect((out.poi_evidence as any[]).length).toBe(100);
    expect(out._prior_snapshot_truncated).toBe(true);
  });

  it('save/load roundtrip via memory fallback', async () => {
    const s = new ResearchPriorSnapshotService(undefined);
    const req = {
      request_id: 'r1',
      user_id: 'u1',
      message: 'x',
      meta: { conversation_id: 'mem-round' },
    } as RouteAndRunRequestDto;
    await s.save(req, { poi_evidence: [{ id: 'a' }], transport_evidence: { degraded: true } });
    const loaded = await s.load(req);
    expect(loaded?.poi_evidence).toEqual([{ id: 'a' }]);
    expect((loaded?.transport_evidence as any).degraded).toBe(true);
  });
});
