import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { HarnessTraceFilesystemExportService } from './harness-trace-filesystem-export.service';
import { HarnessTraceRecorderService } from './harness-trace-recorder.service';
import { HarnessStepName } from '../contracts/harness-step.types';

describe('HarnessTraceFilesystemExportService', () => {
  const prevDir = process.env.HARNESS_TRACE_EXPORT_DIR;
  const prevFlat = process.env.HARNESS_TRACE_EXPORT_FLAT;

  afterEach(() => {
    if (prevDir === undefined) delete process.env.HARNESS_TRACE_EXPORT_DIR;
    else process.env.HARNESS_TRACE_EXPORT_DIR = prevDir;
    if (prevFlat === undefined) delete process.env.HARNESS_TRACE_EXPORT_FLAT;
    else process.env.HARNESS_TRACE_EXPORT_FLAT = prevFlat;
  });

  it('writes finalized trace JSON and returns repo-relative path (flat layout when HARNESS_TRACE_EXPORT_FLAT=1)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-trace-export-'));
    process.env.HARNESS_TRACE_EXPORT_DIR = dir;
    process.env.HARNESS_TRACE_EXPORT_FLAT = '1';

    const recorder = new HarnessTraceRecorderService();
    const exporter = new HarnessTraceFilesystemExportService(recorder);

    recorder.ensureTrace('harness-req-test', 'req-test');
    recorder.appendStep('harness-req-test', {
      step: HarnessStepName.INTAKE,
      startedAt: '2026-04-17T12:00:00.000Z',
      visibleStateSnapshot: {},
      toolCalls: [],
      validationResults: [],
    });
    recorder.finalize('harness-req-test', 'DONE');

    const rel = exporter.exportClosedTraceIfConfigured('harness-req-test');
    expect(rel).toBeTruthy();
    expect(rel).toContain('harness-req-test.json');
    const abs = path.join(process.cwd(), rel!);
    expect(fs.existsSync(abs)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(abs, 'utf8'));
    expect(parsed.exportedAt).toBeDefined();
    expect(parsed.trace.traceId).toBe('harness-req-test');
    expect(parsed.trace.endedAt).toBeDefined();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('uses YYYY-MM-DD subfolder by default (date from trace.endedAt)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-trace-export-'));
    process.env.HARNESS_TRACE_EXPORT_DIR = dir;
    delete process.env.HARNESS_TRACE_EXPORT_FLAT;

    const recorder = new HarnessTraceRecorderService();
    const exporter = new HarnessTraceFilesystemExportService(recorder);

    recorder.ensureTrace('harness-day-bucket', 'req-b');
    recorder.appendStep('harness-day-bucket', {
      step: HarnessStepName.INTAKE,
      startedAt: '2026-04-18T02:00:00.000Z',
      visibleStateSnapshot: {},
      toolCalls: [],
      validationResults: [],
    });
    recorder.finalize('harness-day-bucket', 'DONE');

    const day = recorder.getTrace('harness-day-bucket')?.endedAt?.slice(0, 10);
    expect(day).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const rel = exporter.exportClosedTraceIfConfigured('harness-day-bucket');
    expect(rel).toBeTruthy();
    expect(rel).toContain(`${day}/`);
    expect(rel).toMatch(new RegExp(`${day}[/\\\\]harness-day-bucket\\.json$`));
    const abs = path.join(process.cwd(), rel!);
    expect(fs.existsSync(abs)).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns null when dir unset', () => {
    delete process.env.HARNESS_TRACE_EXPORT_DIR;
    const recorder = new HarnessTraceRecorderService();
    const exporter = new HarnessTraceFilesystemExportService(recorder);
    recorder.ensureTrace('t2', 'r2');
    recorder.finalize('t2', 'DONE');
    expect(exporter.exportClosedTraceIfConfigured('t2')).toBeNull();
  });
});
