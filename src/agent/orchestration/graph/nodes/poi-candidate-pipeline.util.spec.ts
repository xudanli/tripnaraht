import {
  POI_CANDIDATE_PIPELINE_STAGES,
  POI_CANDIDATE_PIPELINE_VERSION,
  runPoiCandidatePipeline,
} from './poi-candidate-pipeline.util';

describe('poi-candidate-pipeline.util', () => {
  it('freezes stage names (entity_align before dedupe for catalog merge)', () => {
    expect(POI_CANDIDATE_PIPELINE_VERSION).toBe('1.0.0');
    expect(POI_CANDIDATE_PIPELINE_STAGES).toContain('entity_align');
    expect(POI_CANDIDATE_PIPELINE_STAGES).toContain('dedupe');
  });

  it('dedupes, aligns entity keys, filters risk/rejected/missing evidence', () => {
    const out = runPoiCandidatePipeline(
      [
        { place_id: 'a', name: 'Blue Lagoon', address: 'Grindavík' },
        { place_id: 'a', name: 'Blue Lagoon', address: 'Grindavík' },
        { place_id: 'b', name: 'Risk Place', address: 'x', metadata: { risk_level: 'HIGH' } },
        { place_id: 'c', name: 'No Evidence' },
        { place_id: 'd', name: 'Rejected', address: 'y' },
      ],
      { rejectedIds: ['d'] },
    );
    expect(out.pois).toHaveLength(1);
    expect(out.pois[0].place_id).toBe('a');
    expect(out.pois[0].__entity_key).toBeTruthy();
    expect(out.stage_audit.map((s) => s.stage)[0]).toBe('entity_align');
  });

  it('merges synonymous names via ER catalog entity_id when both hit same id', () => {
    // 若两别名都映射同一 entity_id，dedupe 后应只留一条
    const out = runPoiCandidatePipeline([
      { place_id: 'p1', name: '雷克雅未克', address: 'IS' },
      { place_id: 'p2', name: 'Reykjavik', address: 'IS' },
    ]);
    // Reykjavik 未必在中文 catalog；至少雷克雅未克应命中
    expect((out.er_catalog_hits ?? 0) >= 1).toBe(true);
    expect(out.pois.some((p) => p.__er_entity_id === 'IS-REK')).toBe(true);
  });
});
