/**
 * Case 1（极限压力）：闭馆（research_data）+ 时间窗重叠（「闭门羹」与「时空挤压」）
 *
 * 无线上日志时，用合成 itinerary + opening_hours_evidence 驱动真实 itinerary.verify。
 * mapVerifyIssuesToRequiredAdjustments：OPENING_HOURS_CONFLICT → SHORTEN_DAY，TIME_WINDOW_OVERLAP → ADD_BUFFER（target 为重叠对中的后项）。
 * repair.apply：带 target 的 ADD_BUFFER 将后项后移；若存在 buffer_anchor_item_id（verify 的 related_item_id）则锚定该前项的 end，处理序列中非紧邻重叠。
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ItinerarySmartUpdateSkill } from './itinerary-smart-update.skill';
import { ItineraryVerifySkill } from './itinerary-verify.skill';
import { RepairApplySkill } from './repair-apply.skill';
import { mapVerifyIssuesToRequiredAdjustments } from './verify-issues-to-required-adjustments.util';

function buildCase1Itinerary() {
  return {
    request_id: 'stress-case-1',
    days: [
      {
        date: '2026-07-01',
        items: [
          {
            id: 'item-a',
            type: 'POI' as const,
            start_window: '14:00',
            end_window: '16:00',
            location_ref: { place_id: 'poi-a', name: 'Museum A' },
            evidence_refs: [],
            verified: false,
          },
          {
            id: 'item-b',
            type: 'POI' as const,
            start_window: '15:00',
            end_window: '17:00',
            location_ref: { place_id: 'poi-b', name: 'Cafe B' },
            evidence_refs: [],
            verified: false,
          },
          {
            id: 'item-c',
            type: 'POI' as const,
            start_window: '19:00',
            end_window: '20:00',
            location_ref: { place_id: 'poi-c', name: 'Dinner C' },
            evidence_refs: [],
            verified: false,
          },
        ],
      },
    ],
  };
}

const researchDataCase1 = {
  opening_hours_evidence: [
    {
      poi_id: 'poi-a',
      is_open_now: false,
      opening_hours: '临时闭馆 2026-07-01',
    },
  ],
};

describe('itinerary.smart_update stress Case 1 (closed + overlap)', () => {
  it('verify 同时报闭馆 ERROR 与时间重叠 ERROR；映射含 SHORTEN_DAY 与 ADD_BUFFER；smart_update 完整执行', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ItinerarySmartUpdateSkill, ItineraryVerifySkill, RepairApplySkill],
    }).compile();

    const verify = module.get(ItineraryVerifySkill);
    const itinerary = buildCase1Itinerary() as any;

    const verifyOut = await verify.execute({
      itinerary,
      research_data: researchDataCase1,
    });

    const errOpening = verifyOut.issues.filter((i) => i.type === 'OPENING_HOURS_CONFLICT' && i.severity === 'ERROR');
    const errOverlap = verifyOut.issues.filter((i) => i.type === 'TIME_WINDOW_OVERLAP' && i.severity === 'ERROR');
    expect(errOpening.length).toBeGreaterThanOrEqual(1);
    expect(errOverlap.length).toBeGreaterThanOrEqual(1);

    const adj = mapVerifyIssuesToRequiredAdjustments(verifyOut.issues, {});
    const actions = adj.map((a) => a.action);
    expect(actions).toContain('SHORTEN_DAY');
    expect(actions).toContain('ADD_BUFFER');

    const smart = module.get(ItinerarySmartUpdateSkill);
    const out = await smart.execute({
      itinerary: buildCase1Itinerary() as any,
      research_data: researchDataCase1,
      user_change_intent: '下午加 B 且 A 闭馆 — 合成压测',
    });

    expect(out.telemetry.verify.ok).toBe(true);
    expect(out.telemetry.apply.ok).toBe(true);
    expect(out.adjustments.map((a) => a.action)).toEqual(expect.arrayContaining(['SHORTEN_DAY', 'ADD_BUFFER']));
    expect(out.telemetry.narrative.length).toBeGreaterThan(10);

    const verify2 = await verify.execute({
      itinerary: out.itinerary as any,
      research_data: researchDataCase1,
    });
    const overlapAfter = verify2.issues.filter((i) => i.type === 'TIME_WINDOW_OVERLAP' && i.severity === 'ERROR');
    expect(overlapAfter.length).toBe(0);
  });
});
