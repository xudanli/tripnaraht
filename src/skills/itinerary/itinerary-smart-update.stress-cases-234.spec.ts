/**
 * Case 2–4：smart_update 极限压力（意图过载 / 多备选 / 可达性无路线）
 *
 * Case 2：超长 user_change_intent — 断言闭环不崩、telemetry 透传、轻量 intent_bullets 与 narrative。
 * Case 3：extra_adjustments REPLACE_POI + 多条 alternative_pois — 断言 repair 可选用命中项且不抛错。
 *   注意：repair.apply 的 doReplacePoi 按 **location_ref.place_id** 匹配 `adjustment.target`，须传 place_id 而非 item.id。
 * Case 4：transport_evidence 无可行 option — REACHABILITY_ISSUE → CHANGE_TRANSPORT 处方；单轮执行不循环。
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ItinerarySmartUpdateSkill } from './itinerary-smart-update.skill';
import { ItineraryVerifySkill } from './itinerary-verify.skill';
import { RepairApplySkill } from './repair-apply.skill';

const messyUserIntent =
  '把第一天早上挪到下午，删掉那个爬山，换成喝咖啡，哦对了酒店能不能晚点退房？' +
  '还有博物馆那个如果关门就换旁边的，交通尽量地铁，别开车了累死了，' +
  '小孩中午要睡觉留一小时空白，晚上想吃冰岛鱼最好是港口那家如果订不到就算了，' +
  '另外第二天能不能压缩到只玩南岸三个点不要东绕西绕，预算别超。'.repeat(3);

function buildCleanTwoPoiItinerary(requestId = 'stress-case-23') {
  return {
    request_id: requestId,
    days: [
      {
        date: '2026-08-10',
        items: [
          {
            id: 'i1',
            type: 'POI' as const,
            start_window: '10:00',
            end_window: '11:30',
            location_ref: { place_id: 'poi-morning', name: 'Morning spot' },
            evidence_refs: [],
            verified: false,
          },
          {
            id: 'i2',
            type: 'POI' as const,
            start_window: '12:00',
            end_window: '14:00',
            location_ref: { place_id: 'poi-afternoon', name: 'Afternoon spot' },
            evidence_refs: [],
            verified: false,
          },
        ],
      },
    ],
  };
}

describe('itinerary.smart_update stress Case 2 (intent overload)', () => {
  it('超长 user_change_intent 仍完成闭环；telemetry 保留意图且 narrative 可读', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ItinerarySmartUpdateSkill, ItineraryVerifySkill, RepairApplySkill],
    }).compile();
    const smart = module.get(ItinerarySmartUpdateSkill);
    const itin = buildCleanTwoPoiItinerary('stress-case-2') as any;

    const out = await smart.execute({
      itinerary: itin,
      user_change_intent: messyUserIntent,
    });

    expect(out.telemetry.verify.ok).toBe(true);
    expect(out.telemetry.apply.ok).toBe(true);
    expect(out.telemetry.user_change_intent).toBe(messyUserIntent);
    expect(out.telemetry.intent_bullet_count).toBeGreaterThanOrEqual(2);
    expect(out.telemetry.intent_bullets?.length).toBeGreaterThanOrEqual(2);
    expect(out.telemetry.narrative.length).toBeGreaterThan(20);
    expect(out.telemetry.narrative).toMatch(/Verify:|Apply:/);
    expect(out.telemetry.narrative).toMatch(/intent_bullets=\d+/);
    expect(messyUserIntent.length).toBeGreaterThan(150);
  });
});

describe('itinerary.smart_update stress Case 3 (multi alternatives + REPLACE)', () => {
  it('REPLACE_POI + 三条 alternative_pois 时 repair 可选用命中项并完成', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ItinerarySmartUpdateSkill, ItineraryVerifySkill, RepairApplySkill],
    }).compile();
    const smart = module.get(ItinerarySmartUpdateSkill);
    const itin = buildCleanTwoPoiItinerary('stress-case-3') as any;

    const alternatives = {
      alternative_pois: [
        {
          poi_id: 'alt-cafe-a',
          name: 'Cafe A',
          reason: 'nearby',
          evidence_status: 'UNVERIFIED' as const,
        },
        {
          poi_id: 'alt-cafe-b',
          name: 'Cafe B',
          reason: 'backup',
          evidence_status: 'ASSUMPTION' as const,
        },
        {
          poi_id: 'alt-cafe-c',
          name: 'Cafe C',
          reason: 'third',
          evidence_status: 'VERIFIED' as const,
        },
      ],
      alternative_routes: [] as any[],
    };

    const out = await smart.execute({
      itinerary: itin,
      alternatives,
      extra_adjustments: [
        {
          action: 'REPLACE_POI' as const,
          why: '用户不想早上去 Morning spot',
          target: 'poi-morning',
          alternatives: ['alt-cafe-b'],
        },
      ],
    });

    expect(out.telemetry.verify.ok).toBe(true);
    expect(out.telemetry.apply.ok).toBe(true);
    expect(out.repair?.repaired).toBe(true);
    expect(out.itinerary.days[0].items[0].location_ref.place_id).toBe('alt-cafe-b');
    expect(out.adjustments.some((a) => a.action === 'REPLACE_POI')).toBe(true);
  });
});

describe('itinerary.smart_update stress Case 4 (reachability: no transport options)', () => {
  it('transport_evidence 空 options 触发 REACHABILITY；单轮 smart_update 结束且无异常', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ItinerarySmartUpdateSkill, ItineraryVerifySkill, RepairApplySkill],
    }).compile();
    const verify = module.get(ItineraryVerifySkill);
    const itin = buildCleanTwoPoiItinerary('stress-case-4') as any;
    const research = {
      transport_evidence: { options: [] },
    };

    const v = await verify.execute({ itinerary: itin, research_data: research });
    const reach = v.issues.filter((i) => i.type === 'REACHABILITY_ISSUE' && i.severity === 'ERROR');
    expect(reach.length).toBeGreaterThanOrEqual(1);

    const smart = module.get(ItinerarySmartUpdateSkill);
    const out = await smart.execute({
      itinerary: itin,
      research_data: research,
      user_change_intent: 'Day2 中间硬塞一个超远郊点 — 可达性压测',
    });

    expect(out.telemetry.verify.ok).toBe(true);
    expect(out.telemetry.apply.ok).toBe(true);
    expect(out.adjustments.some((a) => a.action === 'CHANGE_TRANSPORT')).toBe(true);
    expect(out.telemetry.narrative).toContain('Verify:');
  });
});
