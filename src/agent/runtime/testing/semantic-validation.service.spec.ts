// src/agent/runtime/testing/semantic-validation.service.spec.ts
import { Test } from '@nestjs/testing';
import { EXECUTION_TIMELINE_SCHEMA_ABI } from '../execution-timeline.schema';
import type { ExecutionTimelineEvent } from '../execution-timeline-event.interface';
import { SemanticValidationModule } from './semantic-validation.module';
import { SemanticValidationService } from './semantic-validation.service';
import { buildSemanticModelSnapshotDescriptor } from './semantic-execution-graph-validation.facade';
import {
  EXECUTION_MODEL_VERSION,
  SEMANTIC_VALIDATION_CONTRACT_REVISION,
  SEMANTIC_VALIDATION_RESULT_SCHEMA_ID,
  SEMANTIC_VALIDATION_RESULT_VERSION,
} from './semantic-validation-result-schema';

function stubEvent(
  p: Partial<ExecutionTimelineEvent> & Pick<ExecutionTimelineEvent, 'spanId' | 'operation' | 'eventType' | 'phase'>,
): ExecutionTimelineEvent {
  const now = new Date().toISOString();
  return {
    schemaAbi: EXECUTION_TIMELINE_SCHEMA_ABI,
    eventId: `ev-${p.spanId}`,
    requestId: 'req-1',
    snapshotId: 'snap-1',
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

describe('SemanticValidationService (kernel API)', () => {
  it('validate delegates to facade and returns versioned ABI', async () => {
    const mod = await Test.createTestingModule({
      imports: [SemanticValidationModule],
    }).compile();
    const svc = mod.get(SemanticValidationService);
    const events: ExecutionTimelineEvent[] = [
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
    const r = svc.validate(events, { mode: 'strict' });
    expect(r.schemaId).toBe(SEMANTIC_VALIDATION_RESULT_SCHEMA_ID);
    expect(r.version).toBe(SEMANTIC_VALIDATION_RESULT_VERSION);
    expect(r.executionModelVersion).toBe(EXECUTION_MODEL_VERSION);
    expect(r.modelSnapshot).toEqual(buildSemanticModelSnapshotDescriptor());
    expect(r.modelSnapshot.contractRevision).toBe(SEMANTIC_VALIDATION_CONTRACT_REVISION);
    expect(r.modelSnapshot.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(r.ok).toBe(true);
    expect(r.completeness.ok).toBe(true);
  });

  it('compare returns symmetric line delta for two snapshots', async () => {
    const mod = await Test.createTestingModule({
      imports: [SemanticValidationModule],
    }).compile();
    const svc = mod.get(SemanticValidationService);
    const good = [
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
    const bad = [
      good[0],
      good[1],
      stubEvent({
        spanId: 's',
        parentSpanId: 'a',
        operation: 'pickRouteDirections',
        eventType: 'span',
        phase: 'route_selector',
      }),
    ];
    const cmp = svc.compare(good, bad);
    expect(cmp.executionModelVersion).toBe(EXECUTION_MODEL_VERSION);
    expect(cmp.modelSnapshot).toEqual(buildSemanticModelSnapshotDescriptor());
    expect(cmp.driftEventStreamDiff).toEqual([]);
    expect(cmp.contractSliceDiff.linesOnlyInLeft.length + cmp.contractSliceDiff.linesOnlyInRight.length).toBeGreaterThan(0);
  });
});
