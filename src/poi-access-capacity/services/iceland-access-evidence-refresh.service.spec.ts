import { IcelandAccessEvidenceRefreshService } from './iceland-access-evidence-refresh.service';

describe('IcelandAccessEvidenceRefreshService', () => {
  const accessSync = { syncAll: jest.fn().mockResolvedValue({ vatnajokull: { overridesUpserted: 1 }, dyrholaey: { overridesUpserted: 1 } }) };
  const capacitySync = { syncFromSeedFile: jest.fn().mockResolvedValue({ snapshotsUpserted: 3 }) };
  const service = new IcelandAccessEvidenceRefreshService(accessSync as any, capacitySync as any);

  it('normalizeForceRefresh true → all scopes', () => {
    expect(service.normalizeForceRefresh(true)).toEqual([
      'access_rules',
      'access_inventory',
      'access_congestion',
    ]);
  });

  it('refresh access_rules only', async () => {
    const result = await service.refresh(['access_rules']);
    expect(result.rules?.overridesUpserted).toBe(2);
    expect(accessSync.syncAll).toHaveBeenCalled();
  });

  it('refresh access_inventory only', async () => {
    const result = await service.refresh(['access_inventory']);
    expect(result.inventory?.snapshotsUpserted).toBe(3);
  });
});
