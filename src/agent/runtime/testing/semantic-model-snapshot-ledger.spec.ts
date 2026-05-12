// src/agent/runtime/testing/semantic-model-snapshot-ledger.spec.ts
import { EXECUTION_TIMELINE_SCHEMA_ABI } from '../execution-timeline.schema';
import type { ExecutionTimelineEvent } from '../execution-timeline-event.interface';
import { compareSemanticRegression } from './semantic-regression.compare';
import {
  deserializeLedgerExportV1,
  SemanticModelSnapshotLedger,
  serializeLedgerExportV1,
} from './semantic-model-snapshot-ledger';
import { SEMANTIC_VALIDATION_CONTRACT_REVISION, SEMANTIC_VALIDATION_RESULT_SCHEMA_ID } from './semantic-validation-result-schema';

function stubEvent(
  p: Partial<ExecutionTimelineEvent> & Pick<ExecutionTimelineEvent, 'spanId' | 'operation' | 'eventType' | 'phase'>,
): ExecutionTimelineEvent {
  const now = new Date().toISOString();
  return {
    schemaAbi: EXECUTION_TIMELINE_SCHEMA_ABI,
    eventId: `ev-${p.spanId}`,
    requestId: 'req-ledger-1',
    snapshotId: 'snap-ledger-1',
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

function goldPath(): ExecutionTimelineEvent[] {
  return [
    stubEvent({
      spanId: 'a',
      parentSpanId: null,
      operation: 'route_and_run:chain.enter',
      eventType: 'chain.enter',
      phase: 'route_and_run',
    }),
    stubEvent({
      spanId: 'c',
      parentSpanId: 'a',
      operation: 'route_and_run.chain',
      eventType: 'span',
      phase: 'route_and_run',
    }),
    stubEvent({
      spanId: 's',
      parentSpanId: 'c',
      operation: 'pickRouteDirections',
      eventType: 'span',
      phase: 'route_selector',
    }),
  ];
}

describe('SemanticModelSnapshotLedger', () => {
  it('register records identity fields; compareById matches direct compare', () => {
    const ledger = new SemanticModelSnapshotLedger();
    const left = goldPath();
    const right = [
      left[0],
      left[1],
      stubEvent({
        spanId: 's',
        parentSpanId: 'a',
        operation: 'pickRouteDirections',
        eventType: 'span',
        phase: 'route_selector',
      }),
    ];
    const idL = ledger.register(left);
    const idR = ledger.register(right);
    expect(idL).toMatch(/^[0-9a-f-]{36}$/i);
    const listed = ledger.listLatest(10);
    expect(listed).toHaveLength(2);
    expect(listed[0].contractRevision).toBe(SEMANTIC_VALIDATION_CONTRACT_REVISION);
    expect(listed[0].schemaId).toBe(SEMANTIC_VALIDATION_RESULT_SCHEMA_ID);
    expect(listed[0].mode).toBe('strict');
    expect(listed.every((r) => r.fingerprint.length === 64)).toBe(true);
    expect(ledger.compareById(idL, idR)).toEqual(compareSemanticRegression(left, right));
  });

  it('listLatest orders by registeredAtMs descending', () => {
    let t = 1_700_000_000_000;
    const spy = jest.spyOn(Date, 'now').mockImplementation(() => {
      t += 1;
      return t;
    });
    try {
      const ledger = new SemanticModelSnapshotLedger();
      const id1 = ledger.register(goldPath());
      const id2 = ledger.register(goldPath());
      const rows = ledger.listLatest(5);
      expect(rows[0].id).toBe(id2);
      expect(rows[1].id).toBe(id1);
    } finally {
      spy.mockRestore();
    }
  });

  it('compareById throws on unknown id', () => {
    const ledger = new SemanticModelSnapshotLedger();
    const id = ledger.register(goldPath());
    expect(() => ledger.compareById(id, '00000000-0000-4000-8000-000000000000')).toThrow(/unknown snapshot id/);
  });

  it('exportSnapshot + JSON roundtrip + importSnapshot restores compareById', () => {
    const a = new SemanticModelSnapshotLedger();
    const left = goldPath();
    const right = [
      left[0],
      left[1],
      stubEvent({
        spanId: 's',
        parentSpanId: 'a',
        operation: 'pickRouteDirections',
        eventType: 'span',
        phase: 'route_selector',
      }),
    ];
    const idL = a.register(left);
    const idR = a.register(right);
    const wire = serializeLedgerExportV1(a.exportSnapshot(idL));
    const b = new SemanticModelSnapshotLedger();
    b.importSnapshot(deserializeLedgerExportV1(wire));
    const idR2 = b.register(right);
    expect(b.compareById(idL, idR2)).toEqual(a.compareById(idL, idR));
  });

  it('importSnapshot rejects duplicate id', () => {
    const ledger = new SemanticModelSnapshotLedger();
    const id = ledger.register(goldPath());
    const blob = ledger.exportSnapshot(id);
    expect(() => ledger.importSnapshot(blob)).toThrow(/duplicate snapshot id/);
  });

  it('importSnapshot rejects fingerprint drift vs current model', () => {
    const ledger = new SemanticModelSnapshotLedger();
    const id = ledger.register(goldPath());
    const exp = ledger.exportSnapshot(id);
    const tampered = { ...exp, modelSnapshot: { ...exp.modelSnapshot, fingerprint: '0'.repeat(64) } };
    const fresh = new SemanticModelSnapshotLedger();
    expect(() => fresh.importSnapshot(tampered)).toThrow(/model fingerprint mismatch/);
  });

  it('importSnapshot with allowExecutionModelUpgrade still rejects same-version fingerprint drift', () => {
    const ledger = new SemanticModelSnapshotLedger();
    const id = ledger.register(goldPath());
    const exp = ledger.exportSnapshot(id);
    const tampered = { ...exp, modelSnapshot: { ...exp.modelSnapshot, fingerprint: '0'.repeat(64) } };
    const fresh = new SemanticModelSnapshotLedger();
    expect(() => fresh.importSnapshot(tampered, { allowExecutionModelUpgrade: true })).toThrow(
      /same executionModelVersion but fingerprint drift/,
    );
  });

  it('exportSnapshot throws for unknown id', () => {
    const ledger = new SemanticModelSnapshotLedger();
    expect(() => ledger.exportSnapshot('00000000-0000-4000-8000-000000000000')).toThrow(/unknown snapshot id/);
  });
});
