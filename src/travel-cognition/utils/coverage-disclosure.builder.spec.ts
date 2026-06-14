import {
  buildCoverageDisclosureFromCoverageMap,
  buildCoverageDisclosureFromRouteAndRunEvidence,
} from './coverage-disclosure.builder';

describe('coverage-disclosure.builder', () => {
  it('builds readiness disclosure from coverage map evidence', () => {
    const disclosure = buildCoverageDisclosureFromCoverageMap({
      pois: [
        {
          evidenceTypes: ['weather', 'opening_hours'],
          metadata: { data_source: 'open-meteo' },
        },
      ],
      dataFreshness: {
        weather: '2026-06-14T10:00:00.000Z',
        roadClosure: '2026-06-14T09:00:00.000Z',
      },
      segments: [{ hazards: [{ type: 'road_closure' }] }],
    });

    expect(disclosure.coveredFactTypes).toEqual(
      expect.arrayContaining(['WEATHER', 'OPENING_HOURS', 'ROAD']),
    );
    expect(disclosure.sourcesUsed).toEqual(
      expect.arrayContaining(['open-meteo', 'weather', 'road.is']),
    );
    expect(disclosure.uncoveredCapabilities).toContain('BOOKABILITY');
    expect(disclosure.summary).toMatch(/未检查/);
  });

  it('builds route-and-run disclosure from evidence bundle', () => {
    const disclosure = buildCoverageDisclosureFromRouteAndRunEvidence({
      evidenceBundle: {
        sources: [{ type: 'HARD_RULE_SNAPSHOT', label: 'hard facts snapshot' }],
        hard_facts: [
          { rule_id: 'drive_safety_v1' },
          { rule_id: 'temporal_opening_v1' },
        ],
      },
    });

    expect(disclosure.coveredFactTypes).toEqual(
      expect.arrayContaining(['WEATHER', 'OPENING_HOURS']),
    );
    expect(disclosure.sourcesUsed).toEqual(
      expect.arrayContaining(['hard facts snapshot', 'drive_safety_v1']),
    );
  });
});
