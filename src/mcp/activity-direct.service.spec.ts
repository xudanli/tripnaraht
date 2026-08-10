import { ActivityDirectService } from './activity-direct.service';
import type { BrowserbaseMcpService } from './browserbase-mcp.service';

describe('ActivityDirectService', () => {
  it('falls back to catalog when Browserbase unavailable', async () => {
    const svc = new ActivityDirectService(undefined);
    const out = await svc.searchActivities({
      query: '有哪些景点是需要我提前预定的？',
      limit: 4,
    });
    expect(out.activities.length).toBeGreaterThanOrEqual(3);
    expect(out.meta.mode).toBe('catalog_only');
    expect(out.activities.every((a) => a.source === 'catalog_fallback')).toBe(true);
    expect(out.activities.every((a) => /^https:\/\//.test(a.url))).toBe(true);
  });

  it('uses Browserbase probe when available', async () => {
    const bb = {
      isAvailable: () => true,
      createSession: jest.fn(async () => ({ sessionId: 's1' })),
      navigate: jest.fn(async () => ({})),
      evaluate: jest.fn(async () => ({
        result: {
          title: 'Glacier Hike',
          priceLabel: 'from €129',
          bookingUrl: 'https://adventures.is/book/glacier',
        },
      })),
    } as unknown as BrowserbaseMcpService;

    const svc = new ActivityDirectService(bb);
    const out = await svc.searchActivities({ query: '冰川徒步', limit: 2 });
    expect(out.meta.probed).toBeGreaterThanOrEqual(1);
    expect(out.activities[0]?.source).toBe('browserbase');
    expect(out.activities[0]?.priceLabel).toContain('129');
    expect(out.activities[0]?.url).toContain('adventures.is/book/glacier');
    expect(bb.createSession).toHaveBeenCalled();
  });

  it('ACTIVITY_BOOKING_BROWSERBASE=0 forces catalog', async () => {
    const prev = process.env.ACTIVITY_BOOKING_BROWSERBASE;
    process.env.ACTIVITY_BOOKING_BROWSERBASE = '0';
    try {
      const bb = {
        isAvailable: () => true,
        createSession: jest.fn(),
      } as unknown as BrowserbaseMcpService;
      const svc = new ActivityDirectService(bb);
      const out = await svc.searchActivities({ query: '蓝湖门票', limit: 1 });
      expect(out.meta.mode).toBe('catalog_only');
      expect(bb.createSession).not.toHaveBeenCalled();
    } finally {
      if (prev == null) delete process.env.ACTIVITY_BOOKING_BROWSERBASE;
      else process.env.ACTIVITY_BOOKING_BROWSERBASE = prev;
    }
  });
});
