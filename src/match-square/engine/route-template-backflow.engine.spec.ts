import {
  appendBackflowExampleToTemplateMetadata,
  buildBackflowExampleRecord,
  readTripBackflowCommit,
  resolveCatalogEntry,
} from './route-template-backflow.engine';
import { ROUTE_TEMPLATE_BACKFLOW_VERSION } from '../types/active-trip-decision-replay.types';

describe('route-template-backflow.engine', () => {
  it('appends example to template metadata', () => {
    const example = buildBackflowExampleRecord({
      catalogId: 'is_laugavegur_55km_heavy_4d',
      preview: {
        catalogId: 'is_laugavegur_55km_heavy_4d',
        routeDirectionName: 'IS_LAUGAVEGUR',
        anonymizedCrewSize: 4,
        taskCompletionRate: 1,
        rollbackConsensusRate: null,
        vaultAuthorizationRate: 1,
        suggestedExampleTitleZh: '范例',
        suggestedExampleSummaryZh: '摘要',
        featureTags: ['vault_contract_sealed'],
      },
      flywheelMetrics: {
        collaborativeTaskEvents: 2,
        routeRollbackEvents: 0,
        vaultContractEvents: 1,
        taskConfirmLatencyMsAvg: 1000,
        routeRollbackConfirmLatencyMs: null,
        taskRevisionTotal: 0,
      },
      timelineEventCount: 3,
    });

    const next = appendBackflowExampleToTemplateMetadata({}, example);
    const block = (next as Record<string, unknown>).matchSquareBackflow_v1 as {
      version: string;
      examples: unknown[];
    };

    expect(block.version).toBe(ROUTE_TEMPLATE_BACKFLOW_VERSION);
    expect(block.examples).toHaveLength(1);
  });

  it('resolves catalog entry', () => {
    expect(resolveCatalogEntry('is_laugavegur_55km_heavy_4d')?.routeDirectionName).toBe(
      'IS_LAUGAVEGUR',
    );
  });

  it('reads trip commit marker', () => {
    const commit = readTripBackflowCommit({
      matchSquareTemplateBackflowCommit: {
        committedAt: '2026-06-07T00:00:00.000Z',
        routeTemplateId: 12,
        exampleId: 'ex-1',
      },
    });
    expect(commit?.routeTemplateId).toBe(12);
  });
});
