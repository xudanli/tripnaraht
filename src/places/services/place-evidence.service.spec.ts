import { PlaceEvidenceService } from './place-evidence.service';

describe('PlaceEvidenceService', () => {
  const service = new PlaceEvidenceService(undefined);

  it('builds date-aware business hours from weekday schedule', () => {
    const result = service.buildEvidence(
      {
        id: 1,
        nameCN: '测试景点',
        nameEN: 'Test POI',
        metadata: {
          timezone: 'Atlantic/Reykjavik',
          openingHours: {
            mon: '09:00-18:00',
            tue: '09:00-18:00',
          },
        },
      },
      { date: '2026-07-06', includeWeather: false, includeTraffic: false },
    );

    return result.then((dto) => {
      expect(dto.evidence.businessHours?.open).toBe('09:00');
      expect(dto.evidence.businessHours?.close).toBe('18:00');
      expect(dto.evidence.businessHours?.timezone).toBe('Atlantic/Reykjavik');
    });
  });

  it('filters business hour exceptions by date', () => {
    const result = service.buildEvidence(
      {
        id: 2,
        nameCN: '例外测试',
        nameEN: 'Exception POI',
        metadata: {
          timezone: 'Atlantic/Reykjavik',
          openingHours: {
            mon: '09:00-18:00',
            exceptions: [
              { date: '2026-07-06', closed: true, note: '维护日' },
              { date: '2026-07-07', open: '10:00', close: '16:00' },
            ],
          },
        },
      },
      { date: '2026-07-06', includeWeather: false, includeTraffic: false },
    );

    return result.then((dto) => {
      expect(dto.evidence.businessHours?.exceptions).toHaveLength(1);
      expect(dto.evidence.businessHours?.exceptions?.[0].closed).toBe(true);
    });
  });

  it('includes wind from metadata for Iceland scenarios', () => {
    const result = service.buildEvidence(
      {
        id: 3,
        nameCN: '斯科加瀑布',
        nameEN: 'Skogafoss',
        metadata: {
          weather: {
            condition: 'windy',
            wind: { speed: 22, direction: 'SW' },
          },
        },
      },
      { date: '2026-07-06', includeWeather: true, includeTraffic: false },
    );

    return result.then((dto) => {
      expect(dto.evidence.weatherWindow?.wind?.speed).toBe(22);
      expect(dto.evidence.weatherWindow?.condition).toBe('windy');
    });
  });
});
