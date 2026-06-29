import {
  computeJourneyMapEtag,
  computeJourneyMapInspectorActivityEtag,
  formatEtagHeader,
  ifNoneMatchMatches,
  normalizeEtag,
} from './journey-map-etag.util';

describe('journey-map-etag.util', () => {
  const baseInput = {
    tripId: 'trip-abc',
    tripUpdatedAt: '2026-06-29T00:00:00.000Z',
    coverageCalculatedAt: '2026-06-29T12:00:00.000Z',
    itemCount: 12,
    fields: 'minimal' as const,
    includeInspector: false,
  };

  it('computeJourneyMapEtag is stable for same input', () => {
    const a = computeJourneyMapEtag(baseInput);
    const b = computeJourneyMapEtag(baseInput);
    expect(a).toBe(b);
    expect(a).toHaveLength(16);
  });

  it('computeJourneyMapEtag differs when fields or includeInspector change', () => {
    const minimal = computeJourneyMapEtag(baseInput);
    const full = computeJourneyMapEtag({ ...baseInput, fields: 'full' });
    const inspector = computeJourneyMapEtag({ ...baseInput, includeInspector: true });
    expect(full).not.toBe(minimal);
    expect(inspector).not.toBe(minimal);
  });

  it('normalizeEtag strips W/ prefix and quotes', () => {
    expect(normalizeEtag('W/"abc123"')).toBe('abc123');
    expect(normalizeEtag('"abc123"')).toBe('abc123');
  });

  it('formatEtagHeader wraps raw etag', () => {
    expect(formatEtagHeader('abc123')).toBe('"abc123"');
  });

  it('ifNoneMatchMatches accepts quoted If-None-Match', () => {
    const etag = computeJourneyMapEtag(baseInput);
    expect(ifNoneMatchMatches(`"${etag}"`, etag)).toBe(true);
    expect(ifNoneMatchMatches(`W/"${etag}"`, etag)).toBe(true);
    expect(ifNoneMatchMatches('other', etag)).toBe(false);
  });

  it('computeJourneyMapInspectorActivityEtag differs by activityId', () => {
    const a = computeJourneyMapInspectorActivityEtag({ ...baseInput, includeInspector: true, activityId: 'item-a' });
    const b = computeJourneyMapInspectorActivityEtag({ ...baseInput, includeInspector: true, activityId: 'item-b' });
    expect(a).not.toBe(b);
  });
});
