import { projectExplorationInsuranceTier } from './exploration-insurance-tier.adapter';

describe('projectExplorationInsuranceTier', () => {
  it('STANDARD covers collision+gravel and excludes waterCrossing', () => {
    const projection = projectExplorationInsuranceTier('STANDARD')!;
    expect(projection.coveredCauses).toEqual(['collision', 'gravel']);
    expect(projection.excludedCauses).toEqual(['waterCrossing']);
  });

  it('FULL covers all major causes', () => {
    const projection = projectExplorationInsuranceTier('FULL')!;
    expect(projection.coveredCauses).toContain('waterCrossing');
    expect(projection.excludedCauses).toEqual([]);
  });

  it('UNKNOWN returns null', () => {
    expect(projectExplorationInsuranceTier('UNKNOWN')).toBeNull();
  });
});
