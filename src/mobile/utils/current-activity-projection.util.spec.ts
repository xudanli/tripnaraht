import {
  buildCurrentLocationName,
  extractRoadSegmentLabel,
  formatRoadNumber,
  matchRoadLabelFromText,
  resolveActivityImageUrl,
  resolveDestinationShortLabel,
} from './current-activity-projection.util';

describe('current-activity-projection.util', () => {
  it('resolves imageUrl from place metadata', () => {
    expect(
      resolveActivityImageUrl({
        imageUrl: 'https://cdn.example.com/blue-lagoon.jpg',
      }),
    ).toBe('https://cdn.example.com/blue-lagoon.jpg');
  });

  it('formats road numbers for Chinese display', () => {
    expect(formatRoadNumber('204')).toBe('204号公路');
    expect(formatRoadNumber('Route 1')).toBe('1号公路');
    expect(formatRoadNumber('F208')).toBe('F208');
  });

  it('extracts road label from transit note', () => {
    expect(
      extractRoadSegmentLabel({
        itemType: 'TRANSIT',
        note: '沿 204号公路 东行',
      }),
    ).toBe('204号公路');
  });

  it('builds currentLocationName with road and distance', () => {
    expect(
      buildCurrentLocationName({
        roadLabel: '204号公路',
        destinationLabel: '营地',
        distanceMeters: 3200,
      }),
    ).toBe('204号公路 · 距营地 3.2km');
  });

  it('maps hotel destination to 营地', () => {
    expect(
      resolveDestinationShortLabel({
        placeName: 'Vík Campsite',
        placeCategory: 'HOTEL',
      }),
    ).toBe('营地');
  });

  it('matches road label from free text', () => {
    expect(matchRoadLabelFromText('改走一号公路南岸段')).toBe('一号公路');
  });
});
