import { loadRoadRepairTemplatesForCountry } from './road-repair-template.loader';

describe('road-repair-template.loader (PACK-REPAIR)', () => {
  it('PACK-REPAIR-001: IS pack loads road repair templates', () => {
    const bundle = loadRoadRepairTemplatesForCountry('IS');
    expect(bundle).not.toBeNull();
    expect(bundle!.schemaId).toBe('tripnara.road_repair_templates@v1');
    expect(bundle!.templates.length).toBeGreaterThanOrEqual(4);
    expect(bundle!.roadRegions.F208).toContain('IS_SOUTH');
    expect(bundle!.templates.map((t) => t.templateId)).toContain(
      'route_bypass_ring_road',
    );
  });

  it('PACK-REPAIR-002: unknown country returns null', () => {
    expect(loadRoadRepairTemplatesForCountry('JP')).toBeNull();
  });
});
