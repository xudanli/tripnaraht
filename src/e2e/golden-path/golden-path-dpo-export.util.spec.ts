import {
  buildExperienceFlowRoutingDpoRecord,
  buildGoldenPathDpoRecords,
  goldenPathDpoJsonlContent,
  runGoldenPathCgusSearch,
} from './golden-path-dpo-export.util';

describe('golden-path-dpo-export.util', () => {
  it('builds experience_flow_routing DPO record with empathy metadata', () => {
    const record = buildExperienceFlowRoutingDpoRecord();
    expect(record.pair_type).toBe('experience_flow_routing');
    expect(record.metadata?.source).toBe('golden_path_harness');
    expect(record.metadata?.experience_flow?.tempo).toBe('EMPATHY_RECOVERY');
    expect(record.chosen).toContain('shelter-first');
    expect(record.rejected).toContain('froad-heavy');
    expect(record.prompt).toContain('experience_flow');
  });

  it('serializes JSONL with one preference pair per line', () => {
    const content = goldenPathDpoJsonlContent(buildGoldenPathDpoRecords());
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]!) as { pair_type: string };
    expect(parsed.pair_type).toBe('experience_flow_routing');
  });

  it('runGoldenPathCgusSearch ranks shelter-first under storm routing', async () => {
    const cgus = await runGoldenPathCgusSearch();
    expect(cgus.experienceRoutingAudit?.weights.w2).toBe(1.35);
    expect(cgus.rankedCandidates[0]?.candidate.id).toBe('shelter-first');

    const withCgus = buildGoldenPathDpoRecords({ cgus });
    expect(withCgus[0]?.metadata?.cgus_weights?.w2).toBe(1.35);
    expect(withCgus[0]?.prompt).toContain('cgus_experience_routing_audit');
  });
});
