import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { LoopEvalApprovalService } from './loop-eval-approval.service';
import { LoopEvalCaseStorageService } from './loop-eval-case.storage.service';
import type { LoopEvalCase } from '../types/loop-eval-case.types';

describe('LoopEvalApprovalService', () => {
  let tmpDir: string;
  let storage: LoopEvalCaseStorageService;
  let svc: LoopEvalApprovalService;

  const sampleCase = (): LoopEvalCase => ({
    id: 'loop-eval-test-001-golden',
    kind: 'GOLDEN',
    loopType: 'READINESS_REPAIR',
    loopRunId: 'loop_run_1',
    tripId: 'trip-1',
    capturedAt: new Date().toISOString(),
    approval: { status: 'PENDING' },
    sixTuple: {
      context: { tripId: 'trip-1', loopType: 'READINESS_REPAIR', loopRunId: 'loop_run_1', before: {} },
      options: [],
      decision: { loopStatus: 'COMPLETED', requiresApproval: false },
      reason: { diagnoses: [] },
      outcome: { after: {}, iterationCount: 1 },
    },
    metadata: { source: 'loop_engineering_v1' },
  });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'loop-eval-'));
    storage = new LoopEvalCaseStorageService();
    Object.defineProperty(storage, 'casesDir', { value: tmpDir });
    Object.defineProperty(storage, 'approvedDir', { value: path.join(tmpDir, 'approved') });
    Object.defineProperty(storage, 'approvedIndexPath', { value: path.join(tmpDir, 'approved-index.json') });
    svc = new LoopEvalApprovalService(storage);
    await storage.saveCase(sampleCase());
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('approves pending case and promotes GOLDEN to approved corpus', async () => {
    const result = await svc.approve({
      caseId: 'loop-eval-test-001-golden',
      tripId: 'trip-1',
      userId: 'user-1',
      note: 'looks good',
    });
    expect(result.approvalStatus).toBe('APPROVED');
    expect(result.promoted).toBe(true);
    expect(result.case.approval?.reviewedBy).toBe('user-1');
    expect(result.case.metadata?.promotedToApprovedCorpus).toBe(true);

    const approvedFile = path.join(tmpDir, 'approved', 'loop-eval-test-001-golden.json');
    await expect(fs.access(approvedFile)).resolves.toBeUndefined();
  });

  it('rejects pending case', async () => {
    const result = await svc.reject({
      caseId: 'loop-eval-test-001-golden',
      tripId: 'trip-1',
      userId: 'user-1',
    });
    expect(result.approvalStatus).toBe('REJECTED');
    expect(result.promoted).toBe(false);
  });

  it('blocks double review', async () => {
    await svc.approve({ caseId: 'loop-eval-test-001-golden', tripId: 'trip-1', userId: 'user-1' });
    await expect(
      svc.reject({ caseId: 'loop-eval-test-001-golden', tripId: 'trip-1', userId: 'user-2' }),
    ).rejects.toThrow('已处于 APPROVED 状态');
  });
});
