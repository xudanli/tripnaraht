import { collectTravelDiagnostic } from './travel-diagnostic-collector.util';
import {
  buildVoicePayloadForDiagnostic,
  translateDiagnosticToSpokenNarrative,
} from '../services/voice-evidence-translator.util';
import { buildAccommodationHealthUi } from '../../utils/accommodation-health-ui.util';

describe('travel-diagnostic + voice evidence translator', () => {
  it('collectTravelDiagnostic 识别 1666km 级锚距异常', () => {
    const report = collectTravelDiagnostic({
      itinerary: {
        request_id: 'r1',
        days: [{ date: '2026-11-01', items: [] }, { date: '2026-11-02', items: [] }],
      },
      accommodationNightGroups: [
        {
          night_index: 1,
          has_mcp_sample: true,
          cards: [
            {
              id: 'h1',
              name: '某民宿',
              distance_to_anchor_km: 1666,
              anchor_poi_name_zh: '辛格维利尔公园',
            },
          ],
        },
      ],
    });

    expect(report.hasGeoImpossibleConflict).toBe(true);
    expect(report.geoImpossibleStays[0].nightIndex).toBe(1);
    expect(report.season).toBe('WINTER');
    expect(report.hasMajorItineraryConflict).toBe(true);
  });

  it('translateDiagnosticToSpokenNarrative 输出暖心大白话而非术语', () => {
    const report = collectTravelDiagnostic({
      itinerary: {
        request_id: 'r1',
        days: [
          { date: '2026-11-01', items: [] },
          { date: '2026-11-02', items: [] },
          { date: '2026-11-03', items: [] },
          { date: '2026-11-04', items: [] },
        ],
      },
      accommodationNightGroups: [
        {
          night_index: 1,
          has_mcp_sample: true,
          cards: [{ distance_to_anchor_km: 1666, anchor_poi_name_zh: '辛格维利尔' }],
        },
        {
          night_index: 4,
          has_mcp_sample: true,
          cards: [{ distance_to_anchor_km: 293, anchor_poi_name_zh: '米湖温泉' }],
        },
        { night_index: 2, has_mcp_sample: false, cards: [] },
        { night_index: 3, has_mcp_sample: false, cards: [] },
      ],
      selfHealApplied: true,
    });

    const spoken = translateDiagnosticToSpokenNarrative(report);
    expect(spoken).toContain('旅行管家');
    expect(spoken).toContain('别担心');
    expect(spoken).not.toContain('结构性缺口');
    expect(spoken).not.toContain('1666');

    const voice = buildVoicePayloadForDiagnostic(report)!;
    expect(voice.audio_config.speed_factor).toBe(0.85);
    expect(voice.tone_modifier).toBe('empathetic_reassurance');
    expect(voice.audio_config.emotions).toContain('reassurance');
  });

  it('buildAccommodationHealthUi 用驾车时间标签替代 raw km', () => {
    const report = collectTravelDiagnostic({
      itinerary: { request_id: 'r1', days: [{ date: '2026-11-01', items: [] }] },
      accommodationNightGroups: [
        {
          night_index: 1,
          has_mcp_sample: true,
          cards: [{ distance_to_anchor_km: 1666, anchor_poi_name_zh: '辛格维利尔' }],
        },
      ],
    });
    const ui = buildAccommodationHealthUi(report)!;
    expect(ui.nights[0].status).toBe('critical');
    expect(ui.nights[0].warning_badge_zh).toContain('小时车程');
    expect(ui.nights[0].warning_badge_zh).not.toContain('1666');
  });
});
