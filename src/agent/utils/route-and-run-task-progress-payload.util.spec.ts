import {
  taskRecordToProgressPayload,
  terminalPayloadTypeForRecord,
} from './route-and-run-task-progress-payload.util';
import type { RouteAndRunTaskRecord } from '../services/route-and-run-async-task.store';

const baseRecord = (): RouteAndRunTaskRecord => ({
  task_id: 'task_demo_1',
  request_id: 'req_1',
  status: 'PROCESSING',
  current_phase: 'RESEARCH',
  progress_percentage: 18,
  message: '检索中…',
  data: null,
  updated_at: '2026-05-27T00:00:00.000Z',
  created_at: '2026-05-27T00:00:00.000Z',
});

describe('route-and-run-task-progress-payload.util', () => {
  it('maps processing record to PHASE payload', () => {
    const p = taskRecordToProgressPayload(baseRecord(), 'PHASE');
    expect(p.type).toBe('PHASE');
    expect(p.task_id).toBe('task_demo_1');
    expect(p.data).toBeUndefined();
  });

  it('maps SUCCESS to RESULT with data', () => {
    const record = {
      ...baseRecord(),
      status: 'SUCCESS' as const,
      current_phase: 'DONE',
      progress_percentage: 100,
      data: { result: { status: 'OK' } } as any,
    };
    expect(terminalPayloadTypeForRecord(record)).toBe('RESULT');
    const p = taskRecordToProgressPayload(record, 'RESULT');
    expect(p.data).toEqual(record.data);
  });

  it('maps FAILED to ERROR terminal type', () => {
    const record = {
      ...baseRecord(),
      status: 'FAILED' as const,
      current_phase: 'FAILED',
      error: 'boom',
    };
    expect(terminalPayloadTypeForRecord(record)).toBe('ERROR');
    const p = taskRecordToProgressPayload(record, 'ERROR');
    expect(p.error).toBe('boom');
  });
});
