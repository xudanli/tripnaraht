import { evaluateConflictMatrix, type ConflictMatrixRule } from './conflict-matrix.util';

describe('evaluateConflictMatrix', () => {
  it('matches multi-factor hard block and sorts by priority', () => {
    const rules: ConflictMatrixRule[] = [
      {
        id: 'r1',
        conditions: ['segment.type = F_ROAD', 'weather.visibilityMeters < 100'],
        effect: 'HARD_BLOCK',
        priority: 100,
      },
      {
        id: 'r2',
        conditions: ['weather.precipitationMm > 10', 'weather.confidenceScore > 0.85'],
        effect: 'RE_ROUTE',
        priority: 80,
      },
    ];
    const hits = evaluateConflictMatrix({
      rules,
      facts: {
        segment: { type: 'F_ROAD' },
        weather: { visibilityMeters: 80, precipitationMm: 12, confidenceScore: 0.9 },
      },
    });
    expect(hits.map((x) => x.ruleId)).toEqual(['r1', 'r2']);
    expect(hits[0]?.effect).toBe('HARD_BLOCK');
  });
});
