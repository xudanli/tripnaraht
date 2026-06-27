import { ParkaCapacityProvider } from '../providers/parka-capacity.provider';
import { BokunCapacityProvider } from '../providers/bokun-capacity.provider';

describe('capacity providers (seed)', () => {
  const parka = new ParkaCapacityProvider();
  const bokun = new BokunCapacityProvider();

  it('Parka 返回 Landmannalaugar 库存', async () => {
    const snaps = await parka.fetchCapacity({
      poiId: 'is.landmannalaugar',
      dateISO: '2026-07-15',
    });
    expect(snaps?.length).toBeGreaterThan(0);
    expect(snaps?.[0].signalSource).toBe('PARKA');
  });

  it('Bókun 返回 Blue Lagoon 时段', async () => {
    const snaps = await bokun.fetchCapacity('is.blue_lagoon', '2026-08-01');
    expect(snaps.length).toBe(2);
    expect(snaps.some((s) => s.soldOut)).toBe(true);
  });
});
