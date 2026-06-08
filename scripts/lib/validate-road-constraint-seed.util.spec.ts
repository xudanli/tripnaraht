import path from 'path';
import { validateRoadConstraintSeedFile } from './validate-road-constraint-seed.util';

describe('validateRoadConstraintSeedFile', () => {
  const dataDir = path.join(__dirname, '../../data/rag');

  it('validates AU B100 bushfire seed', () => {
    const result = validateRoadConstraintSeedFile(
      path.join(dataDir, 'au-road-constraint-chunks.p0.json'),
      { requiredRoadIds: ['B100'], tripDates: ['2026-01-18'] },
    );
    expect(result.ok).toBe(true);
    expect(result.roadIds).toContain('B100');
  });

  it('validates JP Route 134 typhoon seed', () => {
    const result = validateRoadConstraintSeedFile(
      path.join(dataDir, 'jp-road-constraint-chunks.p0.json'),
      { requiredRoadIds: ['ROUTE134'], tripDates: ['2026-09-15'] },
    );
    expect(result.ok).toBe(true);
    expect(result.roadIds).toContain('ROUTE134');
  });

  it('validates NZ SH94 heavy rain seed', () => {
    const result = validateRoadConstraintSeedFile(
      path.join(dataDir, 'nz-road-constraint-chunks.p0.json'),
      { requiredRoadIds: ['SH94'], tripDates: ['2026-03-12'] },
    );
    expect(result.ok).toBe(true);
    expect(result.roadIds).toContain('SH94');
  });
});
