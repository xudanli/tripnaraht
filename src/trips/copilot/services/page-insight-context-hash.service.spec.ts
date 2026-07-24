import { PageInsightContextHashService } from './page-insight-context-hash.service';
import { DECISION_SPACE_PAGE_AI_CONTRACT } from '../contracts/page-ai-contracts';
import type { ClientPageState } from '../contracts/page-insight.types';

describe('PageInsightContextHashService', () => {
  const service = new PageInsightContextHashService();
  const contract = DECISION_SPACE_PAGE_AI_CONTRACT;

  const baseClient: ClientPageState = {
    pageId: 'DECISION_SPACE',
    lifecycle: 'PLANNING',
    selectedRefs: [{ entityType: 'DECISION_PROBLEM', entityId: 'dc_glacier_trip1' }],
    viewport: { activeTab: 'options' },
  };

  const baseVersions = {
    relevantTripProjectionVersion: 'rev_a',
    relevantConstraintVersion: 'cstr_1',
    relevantDecisionWorkspaceVersion: 'dw_1',
    relevantWorldStateVersion: 'ws_1',
  };

  it('changes when selected Decision Problem changes', () => {
    const a = service.compute(contract, baseClient, baseVersions);
    const b = service.compute(
      contract,
      {
        ...baseClient,
        selectedRefs: [{ entityType: 'DECISION_PROBLEM', entityId: 'dc_other' }],
      },
      baseVersions,
    );
    expect(a).not.toEqual(b);
  });

  it('changes when Decision Workspace version changes', () => {
    const a = service.compute(contract, baseClient, baseVersions);
    const b = service.compute(contract, baseClient, {
      ...baseVersions,
      relevantDecisionWorkspaceVersion: 'dw_2',
    });
    expect(a).not.toEqual(b);
  });

  it('changes when evidence/workspace fingerprint changes', () => {
    const a = service.compute(contract, baseClient, baseVersions);
    const b = service.compute(contract, baseClient, {
      ...baseVersions,
      relevantDecisionWorkspaceVersion: 'dw_1::FRESH::3',
    });
    expect(a).not.toEqual(b);
  });

  it('does NOT change on mapBounds zoom (not in DECISION_SPACE hash fields)', () => {
    const a = service.compute(contract, baseClient, baseVersions);
    const b = service.compute(
      contract,
      {
        ...baseClient,
        viewport: {
          ...baseClient.viewport,
          mapBounds: { north: 66, south: 63, east: -13, west: -24 },
        },
      },
      baseVersions,
    );
    expect(a).toEqual(b);
  });

  it('is stable for identical inputs (cache hit key)', () => {
    const a = service.compute(contract, baseClient, baseVersions);
    const b = service.compute(contract, { ...baseClient }, { ...baseVersions });
    expect(a).toEqual(b);
  });
});
