/**
 * Case 5 — Lifeline Challenge (The Lifeline Challenge)
 * 南岸「风暴隔离」：SafeTravel 封路证据 → verify REACHABILITY (CRITICAL) → smart_update → repair 标记 DRIVE。
 * 与 stress-case-1「闭门羹」编号解耦。
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ItinerarySmartUpdateSkill } from './itinerary-smart-update.skill';
import { ItineraryVerifySkill } from './itinerary-verify.skill';
import { RepairApplySkill } from './repair-apply.skill';
import { createSafeTravelEvidence } from './safetravel-verify-evidence.util';
import { rssRefinedItemsToSafetravelRouteAlerts } from '../world/safetravel-rss-to-route-verify-alerts.util';
import { AlertSeverity } from '../../iceland-info/dto/safetravel.dto';

function buildLifelineItinerary() {
  return {
    request_id: 'stress-case-5-lifeline',
    days: [
      {
        date: '2026-07-01',
        items: [
          {
            id: 'poi-vik',
            type: 'POI' as const,
            start_window: '09:00',
            end_window: '11:00',
            location_ref: { place_id: 'poi-vik', name: 'Vík' },
            evidence_refs: [],
            verified: false,
          },
          {
            id: 'drive-vik-jok',
            type: 'DRIVE' as const,
            start_window: '11:30',
            end_window: '14:30',
            location_ref: { place_id: 'seg-vik-jok', name: 'Ring Road Vík → Jökulsárlón' },
            evidence_refs: [],
            verified: false,
            metadata: { route_segment_ref: 'ring-road:vik-jokulsarlon' },
          },
          {
            id: 'poi-jok',
            type: 'POI' as const,
            start_window: '15:00',
            end_window: '17:00',
            location_ref: { place_id: 'poi-jok', name: 'Jökulsárlón' },
            evidence_refs: [],
            verified: false,
          },
          {
            id: 'hotel-jok',
            type: 'ACCOMMODATION' as const,
            start_window: '20:00',
            end_window: '23:59',
            location_ref: { place_id: 'hotel-jok', name: 'Glacier Lagoon Hotel' },
            evidence_refs: [],
            verified: false,
          },
        ],
      },
      {
        date: '2026-07-02',
        items: [
          {
            id: 'drive-jok-hofn',
            type: 'DRIVE' as const,
            start_window: '09:00',
            end_window: '11:00',
            location_ref: { place_id: 'seg-jok-hofn', name: 'Jökulsárlón → Höfn' },
            evidence_refs: [],
            verified: false,
            metadata: { route_segment_ref: 'ring-road:jokulsarlon-hofn' },
          },
          {
            id: 'poi-hofn',
            type: 'POI' as const,
            start_window: '12:00',
            end_window: '14:00',
            location_ref: { place_id: 'poi-hofn', name: 'Höfn' },
            evidence_refs: [],
            verified: false,
          },
          {
            id: 'hotel-hofn',
            type: 'ACCOMMODATION' as const,
            start_window: '19:00',
            end_window: '23:00',
            location_ref: { place_id: 'hotel-hofn', name: 'Höfn Harbour Inn' },
            evidence_refs: [],
            verified: false,
          },
        ],
      },
    ],
  };
}

function countAccommodation(it: { days: { items: { type: string }[] }[] }) {
  let n = 0;
  for (const d of it.days) {
    for (const i of d.items) {
      if (i.type === 'ACCOMMODATION') n++;
    }
  }
  return n;
}

describe('itinerary.smart_update Case 5 Lifeline (SafeTravel × verify × repair)', () => {
  it('safetravel_alerts + route_segment_ref → CRITICAL REACHABILITY → CHANGE_TRANSPORT on DRIVE; hotels preserved', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ItinerarySmartUpdateSkill, ItineraryVerifySkill, RepairApplySkill],
    }).compile();

    const verify = module.get(ItineraryVerifySkill);
    const smart = module.get(ItinerarySmartUpdateSkill);
    const base = buildLifelineItinerary() as any;
    const research = createSafeTravelEvidence();

    const verifyOut = await verify.execute({
      itinerary: base,
      research_data: research,
    });

    const reach = verifyOut.issues.filter((i) => i.type === 'REACHABILITY_ISSUE');
    expect(reach.length).toBeGreaterThanOrEqual(1);
    expect(reach[0]).toEqual(
      expect.objectContaining({
        type: 'REACHABILITY_ISSUE',
        severity: 'CRITICAL',
        item_id: 'drive-vik-jok',
      }),
    );
    expect(reach[0].message).toMatch(/Road 1|closed|wind/i);

    const hotelsBefore = countAccommodation(base);

    const smartOut = await smart.execute({
      itinerary: base,
      research_data: research,
    });

    expect(smartOut.telemetry?.narrative).toMatch(/Road 1|closed|wind/i);
    expect(smartOut.adjustments.some((a) => a.action === 'CHANGE_TRANSPORT' && a.target === 'drive-vik-jok')).toBe(
      true,
    );
    expect(smartOut.repair?.repaired).toBe(true);

    const drive = smartOut.itinerary.days[0].items.find((x: any) => x.id === 'drive-vik-jok');
    expect(drive?.metadata?.transport_mode_changed).toBe(true);

    expect(countAccommodation(smartOut.itinerary)).toBe(hotelsBefore);
    expect(smartOut.itinerary.days[0].items.some((x: any) => x.id === 'hotel-jok')).toBe(true);
    expect(smartOut.itinerary.days[1].items.some((x: any) => x.id === 'hotel-hofn')).toBe(true);
  });

  it('accepts rss_refined-derived safetravel_alerts (adapter path)', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ItinerarySmartUpdateSkill, ItineraryVerifySkill, RepairApplySkill],
    }).compile();

    const smart = module.get(ItinerarySmartUpdateSkill);
    const base = buildLifelineItinerary() as any;
    const research = {
      safetravel_alerts: rssRefinedItemsToSafetravelRouteAlerts([
        {
          severity: AlertSeverity.CRITICAL,
          title: 'Road conditions',
          body: 'Road 1 CLOSED between Vík and Jökulsárlón due to extreme winds.',
        },
      ]),
    };

    const smartOut = await smart.execute({ itinerary: base, research_data: research });
    expect(smartOut.adjustments.some((a) => a.action === 'CHANGE_TRANSPORT')).toBe(true);
    expect(smartOut.telemetry?.narrative).toMatch(/Road 1|closed|wind/i);
  });
});
