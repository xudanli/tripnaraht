import {
  enrichActionPayload,
  enrichCausalChainPayload,
  enrichDefinitionRow,
  enrichSeverityPayload,
  getKnowledgeFieldCatalog,
} from './execution-risk-knowledge-field-catalog';

describe('execution-risk-knowledge-field-catalog', () => {
  it('exposes four research tables with Chinese labels', () => {
    const catalog = getKnowledgeFieldCatalog();
    expect(catalog.tables.map((t) => t.tableId)).toEqual(
      expect.arrayContaining([
        'definitions',
        'severity-rules',
        'causal-chains',
        'actions',
        'versions',
      ]),
    );
    const def = catalog.tables.find((t) => t.tableId === 'definitions')!;
    expect(def.fields.some((f) => f.field === 'riskCode' && f.labelZh === '风险编码')).toBe(
      true,
    );
    expect(def.fields.some((f) => f.field === 'itemName' && f.meaningZh.length > 0)).toBe(true);
  });

  it('enriches definition / severity / chain / action for table display', () => {
    const def = enrichDefinitionRow({
      canonicalCode: 'WEATHER_STRONG_WIND',
      knowledgeCode: 'ENV-WIND-01',
      riskType: 'ENVIRONMENT',
      displayName: { zh: '强风', en: 'Strong Wind' },
      definition: 'wind',
      isRootCause: true,
      sourceAliases: [],
      status: 'DRAFT',
      since: null,
      generationMode: null,
      capabilityStatus: null,
    });
    expect(def.riskCode).toBe('ENV-WIND-01');
    expect(def.itemName).toBe('强风');
    expect(def.subCategory).toBeNull();

    const sev = enrichSeverityPayload(
      {
        ruleId: 'SR-1',
        knowledgeCode: 'ENV-WIND-01',
        level: 'STOP',
        metric: 'WIND_SUSTAINED_MPS',
        operator: 'GTE',
        minValue: 20,
        unit: 'MPS',
      },
      '强风',
    );
    expect(sev.riskName).toBe('强风');
    expect(sev.stopCondition).toContain('20');
    expect(sev.observationIndicator).toContain('WIND_SUSTAINED_MPS');

    const chain = enrichCausalChainPayload({
      chainId: 'CC-E1',
      knowledgeCode: 'ENV-WIND-01',
      nodes: [
        { nodeId: 'a', knowledgeCode: 'ENV-WIND-01', nodeType: 'ROOT_CAUSE', description: '强风' },
        {
          nodeId: 'b',
          knowledgeCode: 'ROAD-CROSSWIND-01',
          nodeType: 'DIRECT_IMPACT',
          description: '侧风危险',
        },
      ],
      edges: [],
      clusterHint: { primaryKnowledgeCode: 'ENV-WIND-01' },
    });
    expect(chain.rootCause).toBe('强风');
    expect(chain.directImpact1).toBe('侧风危险');

    const action = enrichActionPayload({
      actionCode: 'ACT-TIME-EARLIER',
      name: { zh: '提前出发' },
      aiAutoExecutable: false,
      timeImpactMinRange: { min: -120, max: -15 },
      budgetImpactDescription: '0',
    });
    expect(action.actionName).toBe('提前出发');
    expect(action.isAutoExecutable).toBe(false);
    expect(action.timeImpactMin).toBe('-120 ~ -15');
  });
});
