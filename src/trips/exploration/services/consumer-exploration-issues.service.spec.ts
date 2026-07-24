import { ConsumerExplorationIssuesService } from './consumer-exploration-issues.service';
import { ExplorationPoiIssueBridgeService } from './exploration-poi-issue-bridge.service';

describe('ConsumerExplorationIssuesService CPRE merge', () => {
  it('merges gateway and POI bridge issues into totalIssueCount', async () => {
    const readModel = {
      projectPlanningConflicts: jest.fn(async () => ({
        conflicts: [
          {
            id: 'gw_1',
            severity: 'BLOCK',
            title: 'F208 blocked',
            message: '2WD',
            metadata: { gatewayAssessmentBatchId: 'batch_1' },
          },
        ],
        summary: {},
      })),
    };

    const poiBridge = {
      projectUnresolvedPois: jest.fn(async () => [
        {
          issueId: 'cpre-poi-abc',
          severity: 'VERIFY' as const,
          headline: '请确认地点：天空之湖',
          explanation: '',
          consequence: '',
          decisionRequired: true,
          source: {
            gatewayAssessmentBatchId: 'cpre-exploration-bridge',
            canonicalIssueId: 'cpre-poi-abc',
            tripId: 'trip_1',
            tripVersion: 1,
          },
        },
      ]),
    };

    const prev = process.env.DECISION_GATEWAY_UNIFIED;
    process.env.DECISION_GATEWAY_UNIFIED = '1';

    const service = new ConsumerExplorationIssuesService(
      readModel as any,
      poiBridge as unknown as ExplorationPoiIssueBridgeService,
    );

    const result = await service.listIssuesForScenario({
      tripId: 'trip_1',
      protocolId: 'iceland-discovery-v1',
    });

    expect(result.totalIssueCount).toBe(2);
    expect(result.gatewayIssueCount).toBe(1);
    expect(result.unresolvedPoiIssueCount).toBe(1);
    expect(result.blockerIssueCount).toBe(1);

    if (prev === undefined) delete process.env.DECISION_GATEWAY_UNIFIED;
    else process.env.DECISION_GATEWAY_UNIFIED = prev;
  });

  it('merges ontology snapshot issues without duplicating gateway rules locally', async () => {
    const readModel = {
      projectPlanningConflicts: jest.fn(async () => ({ conflicts: [], summary: {} })),
    };
    const ontologyBridge = {
      projectUnresolvedOntologyIssues: jest.fn(async () => [
        {
          issueId: 'ontology:VEHICLE_CAPABILITY_MISMATCH',
          severity: 'BLOCK' as const,
          headline: '车辆 2WD 不满足路段要求',
          explanation: '车辆 2WD 不满足路段要求',
          consequence: '当前计划不可执行',
          decisionRequired: true,
          source: {
            gatewayAssessmentBatchId: 'travel-ontology-evaluator',
            canonicalIssueId: 'VEHICLE_CAPABILITY_MISMATCH',
            tripId: 'trip_1',
            tripVersion: 1,
          },
        },
      ]),
    };

    const prev = process.env.DECISION_GATEWAY_UNIFIED;
    process.env.DECISION_GATEWAY_UNIFIED = '1';

    const service = new ConsumerExplorationIssuesService(
      readModel as any,
      undefined,
      ontologyBridge as any,
    );

    const result = await service.listIssuesForScenario({ tripId: 'trip_1' });
    expect(result.ontologyIssueCount).toBe(1);
    expect(result.blockerIssueCount).toBe(1);
    expect(result.displayedIssues[0]?.issueId).toBe('ontology:VEHICLE_CAPABILITY_MISMATCH');

    if (prev === undefined) delete process.env.DECISION_GATEWAY_UNIFIED;
    else process.env.DECISION_GATEWAY_UNIFIED = prev;
  });
});
