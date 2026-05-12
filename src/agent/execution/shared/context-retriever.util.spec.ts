import { ContextRetriever, extractCoordinatePairsFromText } from './context-retriever.util';

describe('context-retriever.util', () => {
  it('extractCoordinatePairsFromText 提取多条坐标', () => {
    const pairs = extractCoordinatePairsFromText('先到 64.1,-21.9 再到 65.2,-18.0');
    expect(pairs.length).toBeGreaterThanOrEqual(2);
    expect(pairs[0]).toMatchObject({ lat: 64.1, lng: -21.9 });
  });

  it('findLastResolvedCoordinateFromMessages origin 取最新一对', () => {
    const r = ContextRetriever.findLastResolvedCoordinateFromMessages(
      ['older 1,1', 'newer 64,-22'],
      'origin',
    );
    expect(r).toEqual({ lat: 64, lng: -22 });
  });

  it('findLastResolvedCoordinateFromMessages destination 取与首对不同的下一对', () => {
    const r = ContextRetriever.findLastResolvedCoordinateFromMessages(
      ['第一段 10,20', '第二段 30,40'],
      'destination',
    );
    expect(r).toEqual({ lat: 10, lng: 20 });
  });
});
