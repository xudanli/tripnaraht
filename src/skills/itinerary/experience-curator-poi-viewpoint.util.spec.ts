import type { ItineraryItem } from '../../agent/interfaces/trip-plan.interface';
import {
  pickBestSunsetAnchor,
  buildPoiViewpointIndex,
  scoreSunsetAnchorCandidate,
} from './experience-curator-poi-viewpoint.util';

function poiItem(id: string, name: string, placeId?: string): ItineraryItem {
  return {
    id,
    type: 'POI',
    start_window: '14:00',
    end_window: '15:30',
    location_ref: { name, place_id: placeId },
  } as ItineraryItem;
}

describe('experience-curator-poi-viewpoint', () => {
  const researchData = {
    poi_evidence: {
      pois: [
        {
          place_id: '101',
          metadata: { tags: ['best_sunset_viewpoint'] },
          name: 'Dyrhólaey',
        },
        {
          place_id: '102',
          metadata: { tags: ['museum'] },
          name: 'Skógar Museum',
        },
      ],
    },
  };

  it('prioritizes best_sunset_viewpoint tag over name heuristics', () => {
    const index = buildPoiViewpointIndex(researchData);
    const items = [
      poiItem('a', '黑沙滩 Reynisfjara', '102'),
      poiItem('b', '迪霍拉伊', '101'),
    ];
    const pick = pickBestSunsetAnchor(items, index);
    expect(pick?.item.id).toBe('b');
    expect(pick?.source).toBe('poi_tag');
    expect(pick?.tagLabel).toBe('最佳日落机位');
  });

  it('scores tagged POI higher than untagged coast names', () => {
    const index = buildPoiViewpointIndex(researchData);
    const tagged = scoreSunsetAnchorCandidate(poiItem('t', 'Dyra', '101'), index);
    const heuristic = scoreSunsetAnchorCandidate(poiItem('h', '黑沙滩 Vik', '999'), index);
    expect(tagged.score).toBeGreaterThan(heuristic.score);
  });
});
