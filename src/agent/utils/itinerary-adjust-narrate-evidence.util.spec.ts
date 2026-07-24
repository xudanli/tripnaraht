import {
  buildEvidenceBackedPacingBullets,
  buildItineraryAdjustExperienceValidation,
  detectPacingEvidenceRegion,
} from './itinerary-adjust-narrate-evidence.util';

const myvatnSchedule = [
  { name: '众神瀑布', start_window: '2026-06-06T11:00', end_window: '2026-06-06T13:00', type: 'POI' },
  {
    name: '午间景观路段留白',
    start_window: '2026-06-06T13:00',
    end_window: '2026-06-06T14:00',
    type: 'REST',
  },
  {
    name: '米湖自然温泉',
    start_window: '2026-06-06T14:00',
    end_window: '2026-06-06T16:00',
    type: 'POI',
  },
];

describe('itinerary-adjust-narrate-evidence', () => {
  it('detects myvatn north iceland region profile', () => {
    expect(detectPacingEvidenceRegion(myvatnSchedule)).toBe('myvatn_north_iceland');
  });

  it('builds structured EXPERIENCE_METRIC_VALIDATION with route/thermal/crowd facts', () => {
    const validation = buildItineraryAdjustExperienceValidation({
      scheduleItems: myvatnSchedule,
    });
    expect(validation?.reasoning_type).toBe('EXPERIENCE_METRIC_VALIDATION');
    expect(validation?.region_profile).toBe('myvatn_north_iceland');
    expect(validation?.evidence_facts.route_efficiency).toMatch(/40/);
    expect(validation?.evidence_facts.thermal_sequence).toMatch(/Thermal Reward|热冷/);
    expect(validation?.evidence_facts.crowd_dynamics).toMatch(/大巴|11:00/);
    expect(validation?.evidence_facts.micro_climate_safety).toMatch(/晨雾|5–10°C/);
  });

  it('does not validate wrong thermal order (hotspring before waterfall)', () => {
    const bad = [
      { name: '米湖自然温泉', start_window: '2026-06-06T09:00', end_window: '2026-06-06T11:00', type: 'POI' },
      { name: '众神瀑布', start_window: '2026-06-06T11:00', end_window: '2026-06-06T13:00', type: 'POI' },
    ];
    expect(buildItineraryAdjustExperienceValidation({ scheduleItems: bad })).toBeUndefined();
  });

  it('weaves evidence into user-facing bullets without闭园/去重', () => {
    const validation = buildItineraryAdjustExperienceValidation({
      scheduleItems: myvatnSchedule,
    })!;
    const bullets = buildEvidenceBackedPacingBullets(validation);
    expect(bullets.length).toBeGreaterThanOrEqual(3);
    expect(bullets.join('\n')).toMatch(/热量|生理|动线|微气候/);
    expect(bullets.join('\n')).toMatch(/众神瀑布|米湖自然温泉/);
    expect(bullets.join('\n')).not.toMatch(/闭园|重复景点|走廊/);
  });
});
