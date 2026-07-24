import { buildIcelandPlanningContextFixture } from '../fixtures/contexts/iceland-planning.fixture';
import {
  assertAgentGroundingAbu001,
  assertAgentGroundingCross001,
  assertAgentGroundingDre001,
  buildThreePersonaTraces,
} from './agent-grounding.util';
import {
  expectTravelContextHarnessPass,
  runTravelContextHarnessCase,
} from '../../protocol/run-travel-context-harness.util';
import { AGENT_GROUNDING_PRESETS, buildAgentRunTrace } from '../../protocol/agent-run-trace.types';

describe('AGENT-GROUNDING-CROSS-001 — three personas share Context Revision', () => {
  const snapshot = buildIcelandPlanningContextFixture();

  it('Abu, Dr.Dre, Neptune reference same contextId / snapshotId / revision', async () => {
    const traces = buildThreePersonaTraces(snapshot);

    const result = await runTravelContextHarnessCase({
      caseId: 'AGENT-GROUNDING-CROSS-001',
      snapshot,
      run: async () => assertAgentGroundingCross001(traces),
    });

    expectTravelContextHarnessPass(result);
  });

  it('fails when Neptune uses stale revision (negative control)', async () => {
    const traces = buildThreePersonaTraces(snapshot);
    traces[2] = {
      ...traces[2]!,
      revision: snapshot.meta.revision - 1000,
    };

    const result = await runTravelContextHarnessCase({
      caseId: 'AGENT-GROUNDING-CROSS-001-NEG',
      snapshot,
      run: async () => assertAgentGroundingCross001(traces),
    });

    expect(result.pass).toBe(false);
    expect(result.errors.some((e) => e.includes('same_revision_NEPTUNE'))).toBe(true);
  });
});

describe('AGENT-GROUNDING-ABU-001 / DRE-001 — domain requirements', () => {
  const snapshot = buildIcelandPlanningContextFixture();

  it('ABU includes world and contract domains', async () => {
    const trace = buildAgentRunTrace({
      ...AGENT_GROUNDING_PRESETS.ABU,
      snapshot,
      includedDomains: [...AGENT_GROUNDING_PRESETS.ABU.includeDomains],
    });

    const result = await runTravelContextHarnessCase({
      caseId: 'AGENT-GROUNDING-ABU-001',
      snapshot,
      run: async () => assertAgentGroundingAbu001(trace),
    });
    expectTravelContextHarnessPass(result);
  });

  it('DR_DRE includes participants and plan domains', async () => {
    const trace = buildAgentRunTrace({
      ...AGENT_GROUNDING_PRESETS.DR_DRE,
      snapshot,
      includedDomains: [...AGENT_GROUNDING_PRESETS.DR_DRE.includeDomains],
    });

    const result = await runTravelContextHarnessCase({
      caseId: 'AGENT-GROUNDING-DRE-001',
      snapshot,
      run: async () => assertAgentGroundingDre001(trace),
    });
    expectTravelContextHarnessPass(result);
  });
});
