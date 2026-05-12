import { AlertSeverity } from '../../iceland-info/dto/safetravel.dto';
import {
  inferAffectedRouteSegmentRefsFromSafetravelText,
  matchSafetravelRegionKeys,
  rssRefinedItemsToSafetravelRouteAlerts,
} from './safetravel-rss-to-route-verify-alerts.util';

describe('safetravel-rss-to-route-verify-alerts.util', () => {
  it('inferAffectedRouteSegmentRefs: Vik–Jökulsárlón + Road 1 closed', () => {
    const blob = 'Road 1 CLOSED between Vík and Jökulsárlón due to extreme winds.';
    expect(inferAffectedRouteSegmentRefsFromSafetravelText(blob, 'critical')).toContain('ring-road:vik-jokulsarlon');
  });

  it('inferAffectedRouteSegmentRefs: North Iceland + critical expands REGIONS_TO_SEGMENTS bundle', () => {
    const blob = 'Red alert: severe conditions in North Iceland near Mývatn.';
    const refs = inferAffectedRouteSegmentRefsFromSafetravelText(blob, 'critical');
    expect(refs).toContain('ring-road:north-myvatn-corridor');
    expect(refs).toContain('ring-road:north-akureyri-egilsstadir');
    expect(refs).toContain('ring-road:north-husavik-myvatn');
  });

  it('inferAffectedRouteSegmentRefs: medium + yellow/weather warning + North expands (WARNING severity via alert)', () => {
    const blob = 'Yellow alert: weather warning for Akureyri and North Iceland.';
    const refs = inferAffectedRouteSegmentRefsFromSafetravelText(blob, 'medium');
    expect(refs.some((r) => r.startsWith('ring-road:north-'))).toBe(true);
  });

  it('matchSafetravelRegionKeys detects North from nordurland token', () => {
    expect(matchSafetravelRegionKeys('Norðurland veður').join(',')).toContain('North');
  });

  it('rssRefinedItemsToSafetravelRouteAlerts skips items with no mappable segment', () => {
    const out = rssRefinedItemsToSafetravelRouteAlerts([
      { severity: AlertSeverity.CRITICAL, title: 'X', body: 'Nothing geographic.' },
    ]);
    expect(out).toHaveLength(0);
  });

  it('rssRefinedItemsToSafetravelRouteAlerts maps critical + corridor text', () => {
    const out = rssRefinedItemsToSafetravelRouteAlerts([
      {
        severity: AlertSeverity.CRITICAL,
        title: 'Conditions',
        body: 'Road 1 closed. Travel from Vik to Jökulsárlón not recommended.',
      },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].affected_route_segment_refs).toContain('ring-road:vik-jokulsarlon');
    expect(out[0].id).toMatch(/^safetravel-rss-0-/);
  });
});
