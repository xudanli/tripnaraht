import type { ItineraryItem } from '../../agent/interfaces/trip-plan.interface';
import {
  applyPacingRelaxationCuration,
  applyPacingRelaxToAdjustTargetState,
} from './experience-curator-pacing-relax.util';

function poi(id: string, name: string, start: string, end: string): ItineraryItem {
  return {
    id,
    type: 'POI',
    start_window: `2026-06-06T${start}:00`,
    end_window: `2026-06-06T${end}:00`,
    location_ref: { name },
    evidence_refs: [],
    verified: false,
  };
}

describe('experience-curator-pacing-relax', () => {
  it('reorders waterfall morning, hotspring afternoon, and inserts midday rest for 轻松 intent', () => {
    const items = [
      poi('hs', '米湖自然温泉', '09:00', '11:00'),
      poi('wf', '众神瀑布', '11:00', '13:00'),
    ];
    const { items: out, notes_zh } = applyPacingRelaxationCuration({
      items,
      dateIso: '2026-06-06',
      userIntent: '明天太累了，轻松一点',
    });
    const wf = out.find((it) => it.location_ref.name === '众神瀑布');
    const hs = out.find((it) => it.location_ref.name === '米湖自然温泉');
    const rest = out.find((it) => it.type === 'REST');
    expect(wf?.start_window).toContain('T11:00');
    expect(hs?.start_window).toContain('T14:00');
    expect(rest?.location_ref?.name).toContain('留白');
    expect(notes_zh.length).toBeGreaterThan(0);
    expect(out.indexOf(wf!)).toBeLessThan(out.indexOf(rest!));
    expect(out.indexOf(rest!)).toBeLessThan(out.indexOf(hs!));
  });

  it('applyPacingRelaxToAdjustTargetState fixes bad-case day on orchestrator state', () => {
    const state = {
      metadata: {
        itinerary_adjust_intake: true,
        itinerary_adjust_target_date_iso: '2026-06-06',
        intake_user_message: '明天太累了，轻松一点',
        adaptive_replan_trigger: 'pacing',
      },
      itinerary: {
        days: [
          {
            date: '2026-06-06',
            items: [
              poi('hs', '米湖自然温泉', '09:00', '11:00'),
              poi('wf', '众神瀑布', '11:00', '13:00'),
            ],
          },
        ],
      },
    } as any;
    expect(applyPacingRelaxToAdjustTargetState(state)).toBe(true);
    const hs = state.itinerary.days[0].items.find((it: ItineraryItem) =>
      it.location_ref.name.includes('温泉'),
    );
    expect(hs.start_window).toContain('T14:00');
  });

  it('no-op when intent is not pacing relax', () => {
    const items = [poi('hs', '米湖自然温泉', '09:00', '11:00')];
    const { items: out, notes_zh } = applyPacingRelaxationCuration({
      items,
      dateIso: '2026-06-06',
      userIntent: '加一个新景点',
    });
    expect(out).toEqual(items);
    expect(notes_zh).toEqual([]);
  });
});
