import { buildIcelandPlanningContextFixture } from '../../harness/evals/fixtures/contexts/iceland-planning.fixture';
import {
  assertAgentGroundingCross001,
  buildThreePersonaTraces,
} from '../../harness/evals/agents/agent-grounding.util';
import {
  buildTravelContextContextBlock,
  buildTravelContextGrounding,
} from './travel-context-agent-binding.util';

/** RFC-003 Phase 6 — binding util produces harness-compatible grounding traces */
describe('AGENT-GROUNDING-BINDING-001 — context/build travel context anchor', () => {
  const snapshot = buildIcelandPlanningContextFixture();

  it('three persona groundings share contextId, snapshotId, revision', () => {
    const traces = buildThreePersonaTraces(snapshot);
    expect(assertAgentGroundingCross001(traces).every((a) => a.pass)).toBe(true);
  });

  it('TRAVEL_CONTEXT block embeds grounding metadata for ABU', () => {
    const grounding = buildTravelContextGrounding({
      snapshot,
      agentId: 'ABU',
      taskType: 'ROAD_SAFETY_VALIDATION',
      includeDomains: ['plan', 'world', 'contract'],
    });
    const block = buildTravelContextContextBlock(grounding);

    expect(block.type).toBe('TRAVEL_CONTEXT');
    expect(block.data?.contextId).toBe(snapshot.identity.contextId);
    expect(block.data?.revision).toBe(snapshot.meta.revision);
    expect(block.data?.snapshotId).toBe(snapshot.meta.snapshotId);
    expect(block.data?.domainSlices).toMatchObject({
      world: snapshot.world,
      contract: snapshot.contract,
    });
  });
});
