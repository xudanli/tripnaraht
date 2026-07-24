/**
 * itinerary.experience_curator — SunCalc 日落、POI 最佳日落机位标签、极光 Kp 窗
 */

import type { Itinerary, ItineraryItem } from '../../agent/interfaces/trip-plan.interface';
import { buildAuroraNightObservationSignal } from '../../trips/decision/signals/build-night-observation-feasibility';
import { ItineraryExperienceCuratorSkill } from './itinerary-experience-curator.skill';

const TARGET_DATE = '2026-06-02';

function poiItem(
  id: string,
  name: string,
  start: string,
  end: string,
  extra?: Partial<ItineraryItem>,
): ItineraryItem {
  return {
    id,
    type: 'POI',
    start_window: start,
    end_window: end,
    location_ref: { name, ...(extra?.location_ref ?? {}) },
    evidence_refs: [],
    verified: false,
    ...extra,
  };
}

function buildSunsetDayItinerary(): Itinerary {
  return {
    request_id: 'req-curator-skill',
    days: [
      { date: '2026-06-01', items: [] },
      {
        date: TARGET_DATE,
        items: [
          poiItem('poi-museum', 'Skógar Museum', '14:00', '15:30', {
            location_ref: { place_id: '102', name: 'Skógar Museum' },
          }),
          poiItem('poi-sunset', 'Dyrhólaey', '15:30', '17:00', {
            location_ref: {
              place_id: '101',
              name: 'Dyrhólaey',
              coordinates: { lat: 63.4186, lng: -19.0059 },
            },
          }),
        ],
      },
    ],
  };
}

function buildResearchDataWithSunsetTagAndAurora() {
  return {
    poi_evidence: {
      pois: [
        {
          place_id: '101',
          name: 'Dyrhólaey',
          metadata: { tags: ['best_sunset_viewpoint'] },
        },
      ],
    },
    signals: {
      auroraByDate: {
        [TARGET_DATE]: buildAuroraNightObservationSignal({
          kpIndex: 5,
          cloudCoveragePct: 20,
          visibility: 'high',
          resolvedLat: 63.4186,
          resolvedLng: -19.0059,
        }),
      },
    },
  };
}

describe('ItineraryExperienceCuratorSkill', () => {
  it('aligns golden hour with SunCalc, POI sunset tag, and cached Kp window', async () => {
    const skill = new ItineraryExperienceCuratorSkill();
    const itinerary = buildSunsetDayItinerary();

    const out = await skill.execute({
      tripId: 'trip-curator-skill',
      targetDays: [2],
      userIntent: '冰岛南岸看日落和极光，轻松一点',
      apply_curation: true,
      itinerary,
      research_data: buildResearchDataWithSunsetTagAndAurora(),
      tokenContext: { request_id: 'req-curator-skill' },
    });

    expect(out.phases.some((p) => p.phase === 'golden_hour' && p.applied)).toBe(true);

    const notes = out.curation_notes_zh.join('\n');
    expect(notes).toMatch(/SunCalc|日落/);
    expect(notes).toMatch(/最佳日落机位|POI 标签/);
    expect(notes).toMatch(/Kp=5/);

    // skill 将当日 fit 与初始 70 做均值；poi_tag(92)+极光加成后约为 84
    expect(out.metrics.golden_hour_fit).toBeGreaterThanOrEqual(84);

    const sunsetItem = out.itinerary.days[1].items.find((i) => i.id === 'poi-sunset');
    expect(sunsetItem).toBeDefined();
    expect(sunsetItem!.start_window).not.toBe('15:30');
  });

  it('fetches live Kp via IcelandAuroraAdapter when research cache is absent', async () => {
    const mockAdapter = {
      getAuroraKPIndex: jest.fn().mockResolvedValue(4.5),
      getCloudCover: jest.fn().mockResolvedValue(18),
      calculateAuroraVisibility: jest.fn().mockResolvedValue('moderate'),
    };

    const skill = new ItineraryExperienceCuratorSkill(mockAdapter as never);
    const out = await skill.execute({
      tripId: 'trip-curator-live-aurora',
      targetDays: [2],
      userIntent: '晚上追极光',
      apply_curation: true,
      itinerary: buildSunsetDayItinerary(),
      research_data: {
        poi_evidence: buildResearchDataWithSunsetTagAndAurora().poi_evidence,
      },
      tokenContext: { request_id: 'req-curator-live-aurora' },
    });

    expect(mockAdapter.getAuroraKPIndex).toHaveBeenCalled();
    expect(out.curation_notes_zh.some((n) => /Kp=4\.5/.test(n))).toBe(true);
    expect(out.curation_notes_zh.some((n) => /实时拉取/.test(n))).toBe(true);
  });

  it('skips curation when apply_curation is false', async () => {
    const skill = new ItineraryExperienceCuratorSkill();
    const itinerary = buildSunsetDayItinerary();
    const originalStart = itinerary.days[1].items[1].start_window;

    const out = await skill.execute({
      tripId: 'trip-curator-skip',
      targetDays: [2],
      userIntent: '冰岛看日落',
      apply_curation: false,
      itinerary,
      research_data: buildResearchDataWithSunsetTagAndAurora(),
      tokenContext: { request_id: 'req-curator-skip' },
    });

    expect(out.phases).toHaveLength(0);
    expect(out.curation_notes_zh).toHaveLength(0);
    expect(out.itinerary.days[1].items[1].start_window).toBe(originalStart);
  });
});
