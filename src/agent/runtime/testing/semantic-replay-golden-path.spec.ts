// src/agent/runtime/testing/semantic-replay-golden-path.spec.ts
import { readFileSync } from 'fs';
import { join } from 'path';
import { executionTimelineInputHash } from '../execution-timeline-hash.util';
import { EXECUTION_TIMELINE_SCHEMA_ABI } from '../execution-timeline.schema';
import type { ExecutionTimelineEvent } from '../execution-timeline-event.interface';
import {
  assertSemanticExecutionGraph,
  buildSemanticModelSnapshotDescriptor,
  validateSemanticExecutionGraph,
} from './semantic-execution-graph-validation.facade';
import {
  assertSemanticGoldPathTopology,
  diffSemanticGoldPathTopology,
  diffSemanticGraphCompleteness,
} from './semantic-replay-golden-path.util';
import {
  EXECUTION_MODEL_VERSION,
  SEMANTIC_VALIDATION_RESULT_SCHEMA_ID,
  SEMANTIC_VALIDATION_RESULT_VERSION,
} from './semantic-validation-result-schema';
import expectedHashesFixture from './fixtures/semantic-replay-golden-path/expected_hashes.json';
import memorySnapshotFixture from './fixtures/semantic-replay-golden-path/memory-snapshot.json';

const FIXTURE_PAYLOADS: Record<string, unknown> = {
  chain_enter_input: { trip_id: 'trip-fixture-1', has_message: true },
  chain_span_input: { request_id: 'req-replay-1', trip_id: 'trip-fixture-1' },
  route_selector_input: { countryCode: 'JP', month: 3, pref_n: 2, tripId: 'trip-fixture-1' },
  route_selector_success_output: { status: 'success', selectedRouteCount: 2 },
  chain_success_output: { status: 'success', finalStage: 'route_selector' },
  chain_error_output: { status: 'error', errorType: 'Error' },
  route_selector_error_output: { status: 'error', errorType: 'Error', retryable: true },
};

function timelineEventStub(p: Partial<ExecutionTimelineEvent> & Pick<ExecutionTimelineEvent, 'spanId' | 'operation' | 'eventType' | 'phase'>): ExecutionTimelineEvent {
  const now = new Date().toISOString();
  return {
    schemaAbi: EXECUTION_TIMELINE_SCHEMA_ABI,
    eventId: `ev-${p.spanId}`,
    requestId: 'req-replay-1',
    snapshotId: 'snap-fixture-replay-1',
    snapshotVersion: 1,
    parentSpanId: p.parentSpanId ?? null,
    parentNodeId: p.parentNodeId ?? null,
    nodeId: p.nodeId ?? p.spanId,
    startedAt: p.startedAt ?? now,
    endedAt: p.endedAt ?? now,
    inputHash: p.inputHash ?? null,
    outputHash: p.outputHash ?? null,
    status: p.status ?? 'ok',
    ...p,
  };
}

describe('semantic replay golden path (runtime validation)', () => {
  it('expected_hashes.json matches executionTimelineInputHash for frozen payloads', () => {
    expect(expectedHashesFixture.execution_timeline_schema_abi).toBe(EXECUTION_TIMELINE_SCHEMA_ABI);
    const expected = expectedHashesFixture.hashes as Record<string, string>;
    for (const key of Object.keys(expected)) {
      const payload = FIXTURE_PAYLOADS[key];
      expect(payload).toBeDefined();
      expect(executionTimelineInputHash(payload)).toBe(expected[key]);
    }
  });

  it('memory-snapshot.json satisfies minimal AgentMemoryContext contract', () => {
    const snap = memorySnapshotFixture.snapshot as Record<string, unknown>;
    expect(snap.snapshotId).toBeTruthy();
    expect(snap.snapshotVersion).toBe(1);
    expect(snap.requestId).toBeTruthy();
    expect(Array.isArray(snap.recentDecisions)).toBe(true);
    expect(Array.isArray(snap.recentWorldDecisions)).toBe(true);
    expect(snap.observability).toEqual(expect.objectContaining({ layers: expect.any(Array) }));
  });

  it('validateSemanticExecutionGraph delegates to topology (single CI facade)', () => {
    const anchorId = 'span-anchor-1';
    const chainId = 'span-chain-1';
    const rdId = 'span-rd-1';
    const events: ExecutionTimelineEvent[] = [
      timelineEventStub({
        spanId: anchorId,
        parentSpanId: null,
        operation: 'route_and_run:chain.enter',
        eventType: 'chain.enter',
        phase: 'route_and_run',
      }),
      timelineEventStub({
        spanId: chainId,
        parentSpanId: anchorId,
        operation: 'route_and_run.chain',
        eventType: 'span',
        phase: 'route_and_run',
      }),
      timelineEventStub({
        spanId: rdId,
        parentSpanId: chainId,
        operation: 'pickRouteDirections',
        eventType: 'span',
        phase: 'route_selector',
      }),
    ];
    const merged = validateSemanticExecutionGraph({ events, mode: 'strict' });
    const topo = diffSemanticGoldPathTopology(events);
    expect(merged.schemaId).toBe(SEMANTIC_VALIDATION_RESULT_SCHEMA_ID);
    expect(merged.version).toBe(SEMANTIC_VALIDATION_RESULT_VERSION);
    expect(merged.executionModelVersion).toBe(EXECUTION_MODEL_VERSION);
    expect(merged.modelSnapshot).toEqual(buildSemanticModelSnapshotDescriptor());
    expect(merged.topology).toEqual(topo);
    expect(merged.completeness).toEqual(diffSemanticGraphCompleteness(events));
    expect(merged.completeness.ok).toBe(true);
    expect(merged.completeness.lines).toEqual([]);
    expect(merged.lines).toEqual(topo.lines);
    expect(merged.ok).toBe(topo.ok);
    expect(() => assertSemanticExecutionGraph({ events })).not.toThrow();
  });

  it('completeness catches dangling parent while topology gold path still holds', () => {
    const anchorId = 'span-anchor-1';
    const chainId = 'span-chain-1';
    const rdId = 'span-rd-1';
    const base: ExecutionTimelineEvent[] = [
      timelineEventStub({
        spanId: anchorId,
        parentSpanId: null,
        operation: 'route_and_run:chain.enter',
        eventType: 'chain.enter',
        phase: 'route_and_run',
      }),
      timelineEventStub({
        spanId: chainId,
        parentSpanId: anchorId,
        operation: 'route_and_run.chain',
        eventType: 'span',
        phase: 'route_and_run',
      }),
      timelineEventStub({
        spanId: rdId,
        parentSpanId: chainId,
        operation: 'pickRouteDirections',
        eventType: 'span',
        phase: 'route_selector',
      }),
    ];
    const dangling = timelineEventStub({
      spanId: 'span-orphan',
      parentSpanId: 'missing-parent-id-xyz',
      operation: 'unknown.op',
      eventType: 'span',
      phase: 'route_and_run',
    });
    const events = [...base, dangling];
    const merged = validateSemanticExecutionGraph({ events });
    expect(merged.topology.ok).toBe(true);
    expect(merged.completeness.ok).toBe(false);
    expect(merged.completeness.lines.some((l) => l.includes('Completeness: dangling'))).toBe(true);
    expect(merged.completeness.lines.some((l) => l.includes('Completeness: unmapped'))).toBe(true);
    expect(merged.ok).toBe(false);
  });

  it('assertSemanticGoldPathTopology accepts a synthetic gold-path event list', () => {
    const anchorId = 'span-anchor-1';
    const chainId = 'span-chain-1';
    const rdId = 'span-rd-1';
    const events: ExecutionTimelineEvent[] = [
      timelineEventStub({
        spanId: anchorId,
        parentSpanId: null,
        operation: 'route_and_run:chain.enter',
        eventType: 'chain.enter',
        phase: 'route_and_run',
      }),
      timelineEventStub({
        spanId: chainId,
        parentSpanId: anchorId,
        operation: 'route_and_run.chain',
        eventType: 'span',
        phase: 'route_and_run',
      }),
      timelineEventStub({
        spanId: rdId,
        parentSpanId: chainId,
        operation: 'pickRouteDirections',
        eventType: 'span',
        phase: 'route_selector',
      }),
    ];
    expect(() => assertSemanticGoldPathTopology(events)).not.toThrow();
  });

  it('diffSemanticGoldPathTopology is order-invariant on the same event multiset', () => {
    const mk = (startedAt: string, spanId: string, parentSpanId: string | null, op: string, phase: ExecutionTimelineEvent['phase']) =>
      timelineEventStub({
        spanId,
        parentSpanId,
        operation: op,
        eventType: op === 'route_and_run:chain.enter' ? 'chain.enter' : 'span',
        phase,
        startedAt,
        endedAt: startedAt,
      });
    const a = mk('2026-05-11T00:00:00.000Z', 'z-anchor', null, 'route_and_run:chain.enter', 'route_and_run');
    const c = mk('2026-05-11T00:00:01.000Z', 'm-chain', 'z-anchor', 'route_and_run.chain', 'route_and_run');
    const s = mk('2026-05-11T00:00:02.000Z', 'b-sel', 'm-chain', 'pickRouteDirections', 'route_selector');
    const permuted: ExecutionTimelineEvent[] = [s, a, c];
    const ordered: ExecutionTimelineEvent[] = [a, c, s];
    expect(diffSemanticGoldPathTopology(permuted)).toEqual(diffSemanticGoldPathTopology(ordered));
  });

  it('diffSemanticGoldPathTopology explains parent drift (no bare assert)', () => {
    const anchorId = 'a-root';
    const chainId = 'c-interval';
    const rdId = 's-wrong-parent';
    const events: ExecutionTimelineEvent[] = [
      timelineEventStub({
        spanId: anchorId,
        parentSpanId: null,
        operation: 'route_and_run:chain.enter',
        eventType: 'chain.enter',
        phase: 'route_and_run',
      }),
      timelineEventStub({
        spanId: chainId,
        parentSpanId: anchorId,
        operation: 'route_and_run.chain',
        eventType: 'span',
        phase: 'route_and_run',
      }),
      timelineEventStub({
        spanId: rdId,
        parentSpanId: anchorId,
        operation: 'pickRouteDirections',
        eventType: 'span',
        phase: 'route_selector',
      }),
    ];
    const { ok, lines } = diffSemanticGoldPathTopology(events);
    expect(ok).toBe(false);
    expect(lines.some((l) => l.includes('Expected: selector.parent = chain'))).toBe(true);
    expect(lines.some((l) => l.includes('Actual: selector.parent = anchor'))).toBe(true);
  });

  it('fixture files stay parseable (CI drift guard)', () => {
    const dir = join(__dirname, 'fixtures', 'semantic-replay-golden-path');
    for (const name of ['expected_hashes.json', 'memory-snapshot.json', 'execution_graph_topology.json']) {
      const raw = readFileSync(join(dir, name), 'utf8');
      expect(() => JSON.parse(raw)).not.toThrow();
    }
  });
});
