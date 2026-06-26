import { mapCountryPhysicalData } from './country-physical-data.mapper';

describe('country-physical-data.mapper', () => {
  it('maps road JSON to roadStates and hazardZones', () => {
    const patch = mapCountryPhysicalData({
      countryCode: 'IS',
      month: 7,
      roadStatusJson: [
        {
          roadId: 'F208',
          roadType: 'F-road',
          currentStatus: 'closed',
          requirements: { vehicleType: '4x4_required' },
          hazards: [{ type: 'river_crossing', severity: 'high' }],
          season: { openMonths: [6, 7, 8] },
        },
      ],
    });

    expect(patch.roadStates).toHaveLength(1);
    expect(patch.roadStates[0].status).toBe('CLOSED');
    expect(patch.roadStates[0].requires4x4).toBe(true);
    expect(patch.hazardZones).toHaveLength(1);
  });

  it('maps weather windows to climateSeasonality for month', () => {
    const patch = mapCountryPhysicalData({
      countryCode: 'IS',
      month: 7,
      weatherWindowsJson: {
        regions: [
          {
            bestWindows: [{ months: [7, 8], score: 0.9, description: 'Highland window' }],
          },
        ],
      },
    });

    expect(patch.climateSeasonality?.month).toBe(7);
    expect(patch.climateSeasonality?.accessibilityScore).toBe(0.9);
  });
});
