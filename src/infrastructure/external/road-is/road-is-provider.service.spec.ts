import { RoadIsProviderService } from './road-is-provider.service';

describe('RoadIsProviderService', () => {
  it('mock mode returns CLOSED for ROAD_IS_MOCK_FORCE_CLOSED_ROADS match', async () => {
    const config = {
      get: (k: string) =>
        k === 'ROAD_IS_PROVIDER_MOCK'
          ? 'true'
          : k === 'ROAD_IS_MOCK_FORCE_CLOSED_ROADS'
            ? 'F209'
            : k === 'ROAD_IS_HTTP_TIMEOUT_MS'
              ? '8000'
              : undefined,
    };
    const svc = new RoadIsProviderService(config as any);
    const row = await svc.fetchCondition('F209');
    expect(row.condition).toBe('CLOSED');
    expect(row.provider).toBe('mock');
  });

  it('mock mode returns OPEN by default', async () => {
    const config = {
      get: (k: string) =>
        k === 'ROAD_IS_PROVIDER_MOCK' ? 'true' : k === 'ROAD_IS_HTTP_TIMEOUT_MS' ? '8000' : undefined,
    };
    const svc = new RoadIsProviderService(config as any);
    const row = await svc.fetchCondition('F208');
    expect(row.condition).toBe('OPEN');
  });
});
