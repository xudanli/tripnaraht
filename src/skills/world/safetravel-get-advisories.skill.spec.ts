import { Test, TestingModule } from '@nestjs/testing';
import { SafetravelGetAdvisoriesSkill } from './safetravel-get-advisories.skill';
import { SafetravelService } from '../../iceland-info/services/safetravel.service';
import { AlertSeverity, AlertType } from '../../iceland-info/dto/safetravel.dto';

describe('SafetravelGetAdvisoriesSkill', () => {
  let skill: SafetravelGetAdvisoriesSkill;

  const mockSafetravel = {
    fetchRssFeedAlerts: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SafetravelGetAdvisoriesSkill,
        { provide: SafetravelService, useValue: mockSafetravel },
      ],
    }).compile();
    skill = module.get(SafetravelGetAdvisoriesSkill);
    jest.clearAllMocks();
  });

  it('maps CRITICAL alert to BLOCK', async () => {
    mockSafetravel.fetchRssFeedAlerts.mockResolvedValue({
      alerts: [
        {
          id: '1',
          title: 'Closed',
          description: 'Impassable',
          type: AlertType.ROAD,
          severity: AlertSeverity.CRITICAL,
          effectiveTime: new Date().toISOString(),
          regions: [],
        },
      ],
      rss_refined: [
        {
          severity: AlertSeverity.CRITICAL,
          title: 'Closed',
          body: 'Impassable',
        },
      ],
      travelConditions: [],
      lastUpdated: new Date().toISOString(),
    });

    const out = await skill.execute({});
    expect(out.gate_recommendation).toBe('BLOCK');
    expect(out.source).toBe('safetravel.is/feed');
    expect(out.alerts).toHaveLength(1);
    expect(out.rss_refined).toHaveLength(1);
    expect(out.rss_refined[0].severity).toBe(AlertSeverity.CRITICAL);
    expect(Array.isArray(out.safetravel_alerts)).toBe(true);
  });

  it('exposes safetravel_alerts with segment refs when RSS maps to Ring Road corridor', async () => {
    mockSafetravel.fetchRssFeedAlerts.mockResolvedValue({
      alerts: [],
      rss_refined: [
        {
          severity: AlertSeverity.CRITICAL,
          title: 'Road conditions',
          body: 'Road 1 CLOSED between Vík and Jökulsárlón due to extreme winds.',
        },
      ],
      travelConditions: [],
      lastUpdated: new Date().toISOString(),
    });

    const out = await skill.execute({});
    expect(out.safetravel_alerts.length).toBeGreaterThanOrEqual(1);
    expect(out.safetravel_alerts[0].affected_route_segment_refs).toContain('ring-road:vik-jokulsarlon');
  });

  it('filters by region_keyword', async () => {
    mockSafetravel.fetchRssFeedAlerts.mockResolvedValue({
      alerts: [
        {
          id: 'a',
          title: 'North warning',
          description: 'Snow',
          type: AlertType.WEATHER,
          severity: AlertSeverity.LOW,
          effectiveTime: new Date().toISOString(),
          regions: [],
        },
        {
          id: 'b',
          title: 'South coast',
          description: 'Waves',
          type: AlertType.GENERAL,
          severity: AlertSeverity.LOW,
          effectiveTime: new Date().toISOString(),
          regions: [],
        },
      ],
      rss_refined: [
        { severity: AlertSeverity.LOW, title: 'North warning', body: 'Snow' },
        { severity: AlertSeverity.LOW, title: 'South coast', body: 'Waves' },
      ],
      travelConditions: [],
      lastUpdated: new Date().toISOString(),
    });

    const out = await skill.execute({ region_keyword: 'south' });
    expect(out.alerts).toHaveLength(1);
    expect(out.rss_refined).toHaveLength(1);
    expect(out.alerts[0].title).toContain('South');
  });
});
