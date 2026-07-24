import {
  buildAuroraSlotPlacementRagSection,
  filterAndRankAuroraRagChunks,
  formatAuroraSlotPlacementRagSectionZh,
  mapChunkToAuroraSlotRagEntry,
  scoreAuroraRagChunkRelevance,
} from './aurora-slot-placement-rag.util';

describe('aurora-slot-placement-rag.util', () => {
  it('formats pois and practical into clarification bullets', () => {
    const section = formatAuroraSlotPlacementRagSectionZh(
      [
        mapChunkToAuroraSlotRagEntry('雷克雅未克近郊 Grótta 灯塔适合冬季极光观测。', '冰岛极光观测点指南'),
      ],
      [mapChunkToAuroraSlotRagEntry('11–3 月 KP≥3 时更易看见极光。', '极光季节与预报')],
    );
    expect(section).toMatch(/冰岛极光观测点指南/);
    expect(section).toMatch(/Grótta|灯塔/);
    expect(section).toMatch(/极光季节与预报/);
  });

  it('filters out restaurant/supermarket noise chunks', () => {
    const ranked = filterAndRankAuroraRagChunks(
      [
        mapChunkToAuroraSlotRagEntry('本文档整合了冰岛精选餐厅', '冰岛自驾餐饮锚点指南'),
        mapChunkToAuroraSlotRagEntry('Grótta 灯塔适合极光观测', '冰岛极光观测点指南'),
      ],
      2,
    );
    expect(ranked).toHaveLength(1);
    expect(ranked[0]?.documentTitle).toMatch(/极光观测点/);
    expect(scoreAuroraRagChunkRelevance('餐厅推荐', '冰岛自驾餐饮锚点指南')).toBeLessThan(0);
  });

  it('uses static fallback when no relevant chunks', () => {
    const built = buildAuroraSlotPlacementRagSection(
      [mapChunkToAuroraSlotRagEntry('Bónus 超市价格最低', '冰岛超市与补给指南')],
      [],
    );
    expect(built.usedStaticFallback).toBe(true);
    expect(built.supplementZh).toMatch(/Grótta|南岸暗空/);
  });

  it('strips indexed document markdown artifacts from chunk body', () => {
    const section = formatAuroraSlotPlacementRagSectionZh(
      [
        mapChunkToAuroraSlotRagEntry(
          '[full] ## 冰岛极光观测点\nGrótta 适合冬季观测',
          '冰岛极光观测点指南',
        ),
      ],
      [],
    );
    expect(section).not.toMatch(/\[full\]|## /);
    expect(section).toMatch(/Grótta/);
  });
});
