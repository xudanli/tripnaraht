import { ExaIntegrationService } from './exa-integration.service';

describe('ExaIntegrationService risk parsing', () => {
  it('ignores road-closure results that do not match the requested country or route', () => {
    const service = new ExaIntegrationService();
    const result = {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            results: [
              {
                title: '根据中华人民共和国道路交通安全法实施交通管制',
                text: '公安机关交通管理部门可以对机动车采取限制通行、禁止通行等交通管理措施。',
                url: 'https://example.cn/traffic-control',
              },
            ],
          }),
        },
      ],
    };

    const parsed = (service as any).parseRiskSearchResult(
      result,
      'IS',
      'Laugavegur',
      6,
    );

    expect(parsed).toEqual({ hasRisk: false });
  });

  it('accepts road-closure results that mention Iceland', () => {
    const service = new ExaIntegrationService();
    const result = {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            results: [
              {
                title: 'Iceland road closures in June',
                text: 'Iceland authorities report closed highland roads near the route.',
                url: 'https://example.is/road-closures',
              },
            ],
          }),
        },
      ],
    };

    const parsed = (service as any).parseRiskSearchResult(
      result,
      'IS',
      'Laugavegur',
      6,
    );

    expect(parsed.hasRisk).toBe(true);
    expect(parsed.riskType).toBe('ROAD_CLOSED');
    expect(parsed.confidence).toBe('MEDIUM');
  });

  it('marks route-specific risk results as high confidence', () => {
    const service = new ExaIntegrationService();
    const result = {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            results: [
              {
                title: 'Laugavegur trail closure notice',
                text: 'Iceland officials report the Laugavegur route is closed due to storm damage.',
                url: 'https://example.is/laugavegur-closure',
              },
            ],
          }),
        },
      ],
    };

    const parsed = (service as any).parseRiskSearchResult(
      result,
      'IS',
      'Laugavegur',
      6,
    );

    expect(parsed.hasRisk).toBe(true);
    expect(parsed.riskType).toBe('ROAD_CLOSED');
    expect(parsed.confidence).toBe('HIGH');
  });
});
