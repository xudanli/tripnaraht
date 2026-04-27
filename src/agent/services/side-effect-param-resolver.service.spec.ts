import { SideEffectParamResolverService } from './side-effect-param-resolver.service';

describe('SideEffectParamResolverService', () => {
  it('merges runtime overrides over registry defaults per handler', () => {
    const s = new SideEffectParamResolverService();
    const base = [
      { handlerId: 'side_effect.financial_hold.book_flight_v1', params: { ttl_seconds: 900, hold_ratio: 1 } },
    ];
    s.setOverride('trip.apply_user_edit', 'side_effect.financial_hold.book_flight_v1', { hold_ratio: 0.2 });
    const out = s.resolve('trip.apply_user_edit', base);
    expect(out[0].params).toEqual({ ttl_seconds: 900, hold_ratio: 0.2 });
  });

  it('leaves other actions unchanged when overrides target one action', () => {
    const s = new SideEffectParamResolverService();
    s.setOverride('trip.apply_user_edit', 'side_effect.financial_hold.book_flight_v1', { ttl_seconds: 3600 });
    const other = s.resolve('other.action', [
      { handlerId: 'side_effect.financial_hold.book_flight_v1', params: { ttl_seconds: 100 } },
    ]);
    expect(other[0].params).toEqual({ ttl_seconds: 100 });
  });

  it('applyPatches bumps revision once', () => {
    const s = new SideEffectParamResolverService();
    const r0 = s.getRevision();
    s.applyPatches([
      { action_name: 'a', handler_id: 'h1', params: { x: 1 } },
      { action_name: 'a', handler_id: 'h2', params: { y: 2 } },
    ]);
    expect(s.getRevision()).toBe(r0 + 1);
  });

  it('applyPatches is a no-op when empty (no revision bump)', () => {
    const s = new SideEffectParamResolverService();
    const r0 = s.getRevision();
    s.applyPatches([]);
    expect(s.getRevision()).toBe(r0);
  });

  it('subscribe is called on bump', () => {
    const s = new SideEffectParamResolverService();
    let n = 0;
    const unsub = s.subscribe(() => {
      n += 1;
    });
    s.setOverride('a', 'h', { z: 3 });
    expect(n).toBe(1);
    unsub();
    s.setOverride('a', 'h', { z: 4 });
    expect(n).toBe(1);
  });

  it('replaceAll replaces entire map', () => {
    const s = new SideEffectParamResolverService();
    s.setOverride('a', 'h', { x: 1 });
    s.replaceAll({ b: { h2: { y: 2 } } });
    const snap = s.getSnapshot();
    expect(snap.overrides.a).toBeUndefined();
    expect(snap.overrides.b?.h2).toEqual({ y: 2 });
  });

  it('setOverrideExact replaces cell without merging prior memory', () => {
    const s = new SideEffectParamResolverService();
    s.setOverride('a', 'h', { x: 1, y: 2 });
    s.setOverrideExact('a', 'h', { y: 3 });
    expect(s.getSnapshot().overrides.a?.h).toEqual({ y: 3 });
  });

  it('setOverrideExact with null removes handler', () => {
    const s = new SideEffectParamResolverService();
    s.setOverrideExact('a', 'h', { x: 1 });
    s.setOverrideExact('a', 'h', null);
    expect(s.getSnapshot().overrides.a).toBeUndefined();
  });

  it('applyPersistBatchMemoryExact applies multiple cells in one revision bump', () => {
    const s = new SideEffectParamResolverService();
    const r0 = s.getRevision();
    s.applyPersistBatchMemoryExact([
      { actionName: 'a', handlerId: 'h1', params: { x: 1 } },
      { actionName: 'a', handlerId: 'h2', params: { y: 2 } },
    ]);
    expect(s.getRevision()).toBe(r0 + 1);
    expect(s.getSnapshot().overrides.a?.h1).toEqual({ x: 1 });
    expect(s.getSnapshot().overrides.a?.h2).toEqual({ y: 2 });
  });
});
