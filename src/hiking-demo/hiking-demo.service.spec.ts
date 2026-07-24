import { HikingDemoService } from './hiking-demo.service';
import { DEMEffortMetadataService } from '../trips/dem/services/dem-effort-metadata.service';
import { getFixtureByName } from '../route-directions/fixtures';

describe('HikingDemoService', () => {
  const demEffort = {
    calculateEffortMetadata: jest.fn().mockRejectedValue(new Error('DEM unavailable in test')),
  } as unknown as DEMEffortMetadataService;

  const service = new HikingDemoService(demEffort);

  it('registers IS_LAUGAVEGUR fixture', () => {
    const f = getFixtureByName('IS_LAUGAVEGUR');
    expect(f?.name).toBe('IS_LAUGAVEGUR');
    expect(f?.tags).toContain('徒步');
  });

  it('buildLaugavegurPreview returns computeSteps and fitnessMatch', async () => {
    const preview = await service.buildLaugavegurPreview({ longestHike: 2 });
    expect(preview.computeSteps).toHaveLength(3);
    expect(preview.fitnessMatch.longestHike).toBe(2);
    expect(preview.routeDirectionName).toBe('IS_LAUGAVEGUR');
  });
});
