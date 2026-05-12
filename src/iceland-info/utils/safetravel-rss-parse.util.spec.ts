import {
  inferAlertSeverity,
  inferAlertType,
  parseSafetravelRssItems,
  rssRowsToSafetravelAlerts,
} from './safetravel-rss-parse.util';
import { AlertSeverity, AlertType } from '../dto/safetravel.dto';

describe('safetravel-rss-parse.util', () => {
  const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<item>
  <title><![CDATA[High winds in the Central Highlands]]></title>
  <description><![CDATA[<p>F208 caution. Severe conditions.</p>]]></description>
  <pubDate>Mon, 12 May 2026 10:00:00 GMT</pubDate>
  <guid>https://safetravel.is/?p=1</guid>
</item>
<item>
  <title><![CDATA[Volcano: area closed — impassable]]></title>
  <description><![CDATA[Road closed. Do not enter.]]></description>
  <pubDate>Tue, 13 May 2026 08:00:00 GMT</pubDate>
  <guid>https://safetravel.is/?p=2</guid>
</item>
</channel></rss>`;

  it('parseSafetravelRssItems extracts items', () => {
    const rows = parseSafetravelRssItems(sampleXml);
    expect(rows.length).toBe(2);
    expect(rows[0].title).toContain('Highlands');
  });

  it('rssRowsToSafetravelAlerts maps severity and F-roads', () => {
    const rows = parseSafetravelRssItems(sampleXml);
    const alerts = rssRowsToSafetravelAlerts(rows);
    expect(alerts[0].fRoads).toContain('F208');
    expect(alerts[1].severity).toBe(AlertSeverity.CRITICAL);
    expect(alerts[1].type).toBe(AlertType.TRAVEL);
  });

  it('inferAlertType / inferAlertSeverity heuristics', () => {
    expect(inferAlertType('F-road F910 closed')).toBe(AlertType.ROAD);
    expect(inferAlertSeverity('Road impassable due to flood')).toBe(AlertSeverity.CRITICAL);
  });
});
