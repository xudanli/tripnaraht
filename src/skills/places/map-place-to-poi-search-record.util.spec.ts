import { extractPoiSearchEvidenceFields } from './map-place-to-poi-search-record.util';

describe('extractPoiSearchEvidenceFields', () => {
  it('reads description + visitTip + duration from enrich metadata', () => {
    const out = extractPoiSearchEvidenceFields({
      description: '九寨沟以彩池叠瀑闻名，适合慢节奏自驾停留。',
      category: 'ATTRACTION',
      metadata: {
        visitTipCN: '雨季注意塌方与限流，建议出行前核实。',
        level: '5A',
        estimated_duration_min: 180,
        llmDescription: {
          tags: ['彩池', '自驾', '高原'],
          visitTipCN: 'ignored-if-top-level',
        },
        highlights: ['彩池', '叠瀑'],
      },
    });
    expect(out.description).toContain('九寨沟');
    expect(out.visitTipCN).toContain('限流');
    expect(out.duration_minutes).toBe(180);
    expect(out.level).toBe('5A');
    expect(out.tags).toEqual(expect.arrayContaining(['彩池', '叠瀑']));
  });

  it('falls back to llmDescription tags when highlights empty', () => {
    const out = extractPoiSearchEvidenceFields({
      metadata: { llmDescription: { tags: ['温泉', '夜景'] } },
    });
    expect(out.tags).toEqual(['温泉', '夜景']);
  });
});
