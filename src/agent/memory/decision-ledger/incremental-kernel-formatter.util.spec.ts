import { buildLedgerEdgesFromNodes } from './decision-ledger-anchors.util';
import type { DecisionLedgerSnapshot, LedgerNode } from './decision-ledger.types';
import { assembleRecomputePayloadV1 } from './recompute-payload-assembler.util';
import {
  formatIncrementalKernelUserSegment,
  INCREMENTAL_KERNEL_SYSTEM_PROMPT_V1,
} from './incremental-kernel-formatter.util';
import type { RecomputePayloadV1 } from './recompute-payload.types';

const stableFlight: LedgerNode = {
  nodeId: 'FLIGHT_001',
  parentIds: [],
  consumesNodeIds: [],
  actionType: 'TRANSPORT',
  inputSignatures: { budgetAnchor: 'b', preferenceAnchor: 'p', worldAnchor: 'w' },
  outputRef: { kind: 'flight', payloadDigest: 'd1', summary: 'Round-trip to Iceland confirmed.' },
  status: 'STABLE',
  createdAt: 1,
};

const invalidatedPoi: LedgerNode = {
  nodeId: 'POI_DAY2',
  parentIds: ['FLIGHT_001'],
  consumesNodeIds: [],
  actionType: 'POI',
  inputSignatures: { budgetAnchor: 'b', preferenceAnchor: 'p', worldAnchor: 'w' },
  outputRef: { kind: 'poi', payloadDigest: 'd2', summary: 'South coast beach slot' },
  status: 'INVALIDATED',
  createdAt: 2,
};

function snap(nodes: LedgerNode[]): DecisionLedgerSnapshot {
  const wl = { coarseDigest: 'c', fineDigest: 'f', activeTopics: {} };
  return {
    revision: 'v1',
    nodes: nodes.map(n => JSON.parse(JSON.stringify(n))),
    edges: buildLedgerEdgesFromNodes(nodes),
    anchors: {
      budget: 'b',
      preference: 'p',
      policy: 'pol',
      world: 'w',
      worldLayered: wl,
    },
  };
}

describe('incremental-kernel-formatter', () => {
  it('formatIncrementalKernelUserSegment 包含漂移、锚点、任务与 DEPENDS ON', () => {
    const payload = assembleRecomputePayloadV1(snap([stableFlight, invalidatedPoi]), {
      driftContext: [
        {
          topic: 'world:weather_windows',
          description: 'Orange weather alert in south Iceland.',
          severity: 'HARD',
        },
      ],
    });
    const text = formatIncrementalKernelUserSegment(payload);

    expect(text).toContain('### [CONTEXT: WORLD DRIFT]');
    expect(text).toContain('[CRITICAL] world:weather_windows:');
    expect(text).toContain('### [IMMUTABLE ANCHORS]');
    expect(text).toContain('[FLIGHT_001] (TRANSPORT):');
    expect(text).toContain('### [RECOMPUTE TASKS]');
    expect(text).toContain('NODE: [POI_DAY2]');
    expect(text).toContain('DEPENDS ON: [FLIGHT_001]');
    expect(text).toContain('PREVIOUS RESULT: South coast beach slot');
  });

  it('SOFT 漂移使用 [SOFT] 前缀；空描述时回退默认句', () => {
    const payload = assembleRecomputePayloadV1(snap([stableFlight, invalidatedPoi]), {
      driftContext: [{ topic: 'telemetry:total_cost_hint', description: '', severity: 'SOFT' }],
    });
    const text = formatIncrementalKernelUserSegment(payload);
    expect(text).toContain('[SOFT] telemetry:total_cost_hint:');
    expect(text).toContain('Information expired or changed.');
  });

  it('无 INVALIDATED 节点时给出显式空任务说明', () => {
    const payload: RecomputePayloadV1 = {
      revision: 'v1',
      invalidatedSubGraph: { nodes: [], incomingEdges: [] },
      stableAnchorNodes: [],
      driftContext: [],
      orderedTaskIds: [],
    };
    const text = formatIncrementalKernelUserSegment(payload);
    expect(text).toContain('(none — no INVALIDATED nodes in this payload.)');
  });

  it('INCREMENTAL_KERNEL_SYSTEM_PROMPT_V1 约束不可变锚、nodeId 与 decisions 信封', () => {
    expect(INCREMENTAL_KERNEL_SYSTEM_PROMPT_V1).toContain('STRICT IMMUTABILITY');
    expect(INCREMENTAL_KERNEL_SYSTEM_PROMPT_V1).toContain('nodeId');
    expect(INCREMENTAL_KERNEL_SYSTEM_PROMPT_V1).toContain('Differential Ledger');
    expect(INCREMENTAL_KERNEL_SYSTEM_PROMPT_V1).toContain('OUTPUT_FORMAT_REQUIREMENT');
    expect(INCREMENTAL_KERNEL_SYSTEM_PROMPT_V1).toContain('"decisions"');
  });
});
