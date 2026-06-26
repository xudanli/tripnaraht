import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { LoopEvalCase, LoopEvalApprovalStatus } from '../types/loop-eval-case.types';

export interface ListLoopEvalCasesOptions {
  tripId?: string;
  approvalStatus?: LoopEvalApprovalStatus;
}

@Injectable()
export class LoopEvalCaseStorageService {
  private readonly logger = new Logger(LoopEvalCaseStorageService.name);
  private readonly casesDir = path.resolve(
    __dirname,
    '../../trips/decision/evaluation/e2e-cases/generated/loops',
  );
  private readonly approvedDir = path.join(
    path.resolve(__dirname, '../../trips/decision/evaluation/e2e-cases/generated/loops'),
    'approved',
  );
  private readonly approvedIndexPath = path.join(
    path.resolve(__dirname, '../../trips/decision/evaluation/e2e-cases/generated/loops'),
    'approved-index.json',
  );

  async saveCase(testCase: LoopEvalCase): Promise<string> {
    await fs.mkdir(this.casesDir, { recursive: true });
    const filePath = path.join(this.casesDir, `${testCase.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(testCase, null, 2), 'utf-8');
    this.logger.debug(`Saved loop eval case ${testCase.id}`);
    return filePath;
  }

  async loadCase(caseId: string): Promise<LoopEvalCase | null> {
    try {
      const filePath = path.join(this.casesDir, `${caseId}.json`);
      const raw = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(raw) as LoopEvalCase;
    } catch {
      return null;
    }
  }

  async listCases(opts?: ListLoopEvalCasesOptions): Promise<LoopEvalCase[]> {
    try {
      const files = await fs.readdir(this.casesDir);
      const cases: LoopEvalCase[] = [];
      for (const file of files.filter((f) => f.endsWith('.json') && f !== 'approved-index.json')) {
        const raw = await fs.readFile(path.join(this.casesDir, file), 'utf-8');
        const parsed = JSON.parse(raw) as LoopEvalCase;
        if (opts?.tripId && parsed.tripId !== opts.tripId) continue;
        const status = parsed.approval?.status ?? 'PENDING';
        if (opts?.approvalStatus && status !== opts.approvalStatus) continue;
        cases.push(parsed);
      }
      return cases.sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
    } catch {
      return [];
    }
  }

  async promoteToApprovedCorpus(testCase: LoopEvalCase): Promise<boolean> {
    if (testCase.metadata?.promotedToApprovedCorpus) return false;

    await fs.mkdir(this.approvedDir, { recursive: true });
    const approvedPath = path.join(this.approvedDir, `${testCase.id}.json`);
    const promoted: LoopEvalCase = {
      ...testCase,
      metadata: {
        ...testCase.metadata,
        source: 'loop_engineering_v1',
        promotedToApprovedCorpus: true,
        tags: [...(testCase.metadata?.tags ?? []), 'approved-corpus'],
      },
    };
    await fs.writeFile(approvedPath, JSON.stringify(promoted, null, 2), 'utf-8');
    await this.appendApprovedIndex(promoted);
    await this.saveCase(promoted);
    this.logger.log(`Promoted loop eval case ${testCase.id} to approved corpus`);
    return true;
  }

  private async appendApprovedIndex(testCase: LoopEvalCase): Promise<void> {
    let index: { cases: Array<{ id: string; tripId: string; kind: string; loopType: string; approvedAt: string }> } = {
      cases: [],
    };
    try {
      const raw = await fs.readFile(this.approvedIndexPath, 'utf-8');
      index = JSON.parse(raw);
    } catch {
      // fresh index
    }

    if (!index.cases.some((c) => c.id === testCase.id)) {
      index.cases.push({
        id: testCase.id,
        tripId: testCase.tripId,
        kind: testCase.kind,
        loopType: testCase.loopType,
        approvedAt: testCase.approval?.reviewedAt ?? new Date().toISOString(),
      });
      await fs.writeFile(this.approvedIndexPath, JSON.stringify(index, null, 2), 'utf-8');
    }
  }

  async existsForLoopRun(loopRunId: string): Promise<boolean> {
    const cases = await this.listCases();
    return cases.some((c) => c.loopRunId === loopRunId);
  }
}
