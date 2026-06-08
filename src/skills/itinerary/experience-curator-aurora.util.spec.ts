import {
  buildAuroraCurationNotes,
  resolveExperienceAuroraContext,
} from './experience-curator-aurora.util';
import { buildAuroraNightObservationSignal } from '../../trips/decision/signals/build-night-observation-feasibility';
import { buildAuroraOpportunitySignal } from '../../trips/decision/signals/build-aurora-opportunity';

describe('experience-curator-aurora', () => {
  it('reads cached auroraByDate from research_data.signals', async () => {
    const night = buildAuroraNightObservationSignal({
      kpIndex: 4.5,
      cloudCoveragePct: 22,
      visibility: 'moderate',
      resolvedLat: 64.1,
      resolvedLng: -21.9,
    });
    const ctx = await resolveExperienceAuroraContext({
      dateIso: '2026-03-10',
      lat: 64.1,
      lng: -21.9,
      researchData: { signals: { auroraByDate: { '2026-03-10': night } } },
      preferLive: false,
    });
    expect(ctx?.night.kpIndex).toBe(4.5);
    expect(ctx?.liveFetched).toBe(false);
  });

  it('emits Kp-aware curation notes when tier is elevated', () => {
    const night = buildAuroraNightObservationSignal({
      kpIndex: 5,
      cloudCoveragePct: 15,
      visibility: 'high',
      resolvedLat: 63.4,
      resolvedLng: -19.0,
    });
    const opportunity = buildAuroraOpportunitySignal('2026-03-10', night);
    const notes = buildAuroraCurationNotes({
      dateIso: '2026-03-10',
      night,
      opportunity,
      liveFetched: true,
    });
    expect(notes.some((n) => /Kp=5/.test(n))).toBe(true);
    expect(notes.some((n) => /22:30/.test(n) || /守候/.test(n))).toBe(true);
  });
});
