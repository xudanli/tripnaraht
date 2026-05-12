import {
  assertDescriptorCoversRequiredImpactsV1,
  buildCidSemanticViewV1,
  ChangeImpactDescriptorValidationError,
  CID_AXIS_STABILITY_LOCK,
  CID_AXIS_VERSION,
  collectRequiredImpactsFromChangedFilesV1,
  computeExecutionSemanticFingerprintV1,
  parseChangeImpactDescriptorV1,
  serializeChangeImpactDescriptorForCompare,
} from './execution-os-change-impact-descriptor.v1';

describe('execution-os-change-impact-descriptor v1', () => {
  it('parses baseline NONE + rationale when all impacts false', () => {
    const d = parseChangeImpactDescriptorV1({
      schemaId: 'agent.execution_os.change_impact_descriptor@v1',
      version: 1,
      classification: 'NONE',
      impacts: {
        traceSchema: false,
        memoryBinding: false,
        replayDeterminism: false,
        governanceHash: false,
      },
      summary: 'short ok ',
      rationaleNoContractImpact:
        'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    });
    expect(d.classification).toBe('NONE');
  });

  it('rejects classification GOVERNANCE without governanceHash', () => {
    expect(() =>
      parseChangeImpactDescriptorV1({
        schemaId: 'agent.execution_os.change_impact_descriptor@v1',
        version: 1,
        classification: 'GOVERNANCE',
        impacts: {
          traceSchema: false,
          memoryBinding: false,
          replayDeterminism: false,
          governanceHash: false,
        },
        summary: 'Governance PR',
        rationaleNoContractImpact: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      }),
    ).toThrow(ChangeImpactDescriptorValidationError);
  });

  it('CID_AXIS_VERSION is pinned for semantic axis material', () => {
    expect(CID_AXIS_VERSION).toBe('v1');
  });

  it('CID_AXIS_STABILITY_LOCK anchors closed v1 axis', () => {
    expect(CID_AXIS_STABILITY_LOCK).toBe(true);
  });

  it('buildCidSemanticViewV1 derives fingerprint from classification + impacts', () => {
    const d = parseChangeImpactDescriptorV1({
      schemaId: 'agent.execution_os.change_impact_descriptor@v1',
      version: 1,
      classification: 'REPLAY',
      impacts: {
        traceSchema: false,
        memoryBinding: false,
        replayDeterminism: true,
        governanceHash: false,
      },
      summary: 'replay surface change',
    });
    const v = buildCidSemanticViewV1(d);
    expect(v.schemaId).toBe('agent.execution_os.cid_semantic_view@v1');
    expect(v.fingerprint.length).toBeGreaterThan(0);
    expect(v.classification).toBe('REPLAY');
  });

  it('computeExecutionSemanticFingerprintV1 changes when CID present vs absent', () => {
    const route = {
      task_type: 'GENERIC_QA',
      route_policy_resolved: 'LEGACY',
      intent_mode_requested: 'AUTO',
      intent_mode_resolved: 'GENERIC_QA',
    };
    const a = computeExecutionSemanticFingerprintV1({
      modelFingerprint: 'm'.repeat(64),
      routeDecisionPath: route,
      changeImpactDescriptor: null,
    });
    const d = parseChangeImpactDescriptorV1({
      schemaId: 'agent.execution_os.change_impact_descriptor@v1',
      version: 1,
      classification: 'TRACE',
      impacts: {
        traceSchema: true,
        memoryBinding: false,
        replayDeterminism: false,
        governanceHash: false,
      },
      summary: 'trace impact',
    });
    const b = computeExecutionSemanticFingerprintV1({
      modelFingerprint: 'm'.repeat(64),
      routeDecisionPath: route,
      changeImpactDescriptor: d,
    });
    expect(a).not.toBe(b);
  });

  it('serializeChangeImpactDescriptorForCompare is stable for equality checks', () => {
    const a = parseChangeImpactDescriptorV1({
      schemaId: 'agent.execution_os.change_impact_descriptor@v1',
      version: 1,
      classification: 'TRACE',
      impacts: {
        traceSchema: true,
        memoryBinding: false,
        replayDeterminism: false,
        governanceHash: false,
      },
      summary: 'trace-only change impact',
    });
    const b = parseChangeImpactDescriptorV1({
      schemaId: 'agent.execution_os.change_impact_descriptor@v1',
      version: 1,
      classification: 'TRACE',
      impacts: {
        traceSchema: true,
        memoryBinding: false,
        replayDeterminism: false,
        governanceHash: false,
      },
      summary: 'trace-only change impact',
    });
    expect(serializeChangeImpactDescriptorForCompare(a)).toBe(serializeChangeImpactDescriptorForCompare(b));
  });

  it('strict heuristic: governance file requires governanceHash in descriptor', () => {
    const files = ['src/agent/contracts/execution-gateway-contract-governance.v1.ts'];
    const req = collectRequiredImpactsFromChangedFilesV1(files);
    expect(req.has('governanceHash')).toBe(true);
    const desc = parseChangeImpactDescriptorV1({
      schemaId: 'agent.execution_os.change_impact_descriptor@v1',
      version: 1,
      classification: 'GOVERNANCE',
      impacts: {
        traceSchema: false,
        memoryBinding: false,
        replayDeterminism: false,
        governanceHash: true,
      },
      summary: 'Update governance hash material',
    });
    expect(() => assertDescriptorCoversRequiredImpactsV1(desc, req)).not.toThrow();
  });
});
