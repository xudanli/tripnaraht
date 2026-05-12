import { AlertSeverity } from '../dto/safetravel.dto';
import { extractValidUntilHint, inferAffectedRegionsFromText, refineSafetravelRssItem } from './safetravel-rss-refine.util';

describe('safetravel-rss-refine.util', () => {
  it('maps yellow alert to MEDIUM and strips HTML body', () => {
    const r = refineSafetravelRssItem({
      id: 'x',
      title: 'Yellow alert: High winds in South Iceland',
      description: '<p>Avoid <b>coastal</b> roads.</p>',
      pubDate: 'Mon, 12 May 2026 10:00:00 GMT',
    });
    expect(r.severity).toBe(AlertSeverity.MEDIUM);
    expect(r.body).toBe('Avoid coastal roads.');
    expect(r.title).toBe('Yellow alert: High winds in South Iceland');
    expect(r.published_at).toMatch(/^2026-05-12/);
    expect(r.affected_regions).toContain('South');
  });

  it('extractValidUntilHint parses explicit ISO after until', () => {
    const iso = extractValidUntilHint('Travelers should stay alert until 2026-05-20T06:00:00Z in the area.');
    expect(iso).toBe(new Date('2026-05-20T06:00:00Z').toISOString());
  });

  it('inferAffectedRegionsFromText picks South for South Iceland', () => {
    expect(inferAffectedRegionsFromText('Yellow alert: High winds in South Iceland')).toContain('South');
  });
});
