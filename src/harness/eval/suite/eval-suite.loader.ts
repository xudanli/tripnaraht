import { Injectable } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { EvalSuiteDefinition } from './eval-case.types';

const DEFAULT_SUITES_DIR = path.join(process.cwd(), 'fixtures', 'harness', 'eval', 'suites');

@Injectable()
export class EvalSuiteLoader {
  private readonly suitesRoot = DEFAULT_SUITES_DIR;

  resolveSuitePath(suiteId: string): string {
    const file = suiteId.endsWith('.json') ? suiteId : `${suiteId}.json`;
    return path.isAbsolute(file) ? file : path.join(this.suitesRoot, file);
  }

  loadSuite(suiteId: string): EvalSuiteDefinition {
    const abs = this.resolveSuitePath(suiteId);
    if (!fs.existsSync(abs)) {
      throw new Error(`Eval suite not found: ${abs}`);
    }
    const raw = JSON.parse(fs.readFileSync(abs, 'utf8')) as EvalSuiteDefinition;
    if (!raw.suiteId || !Array.isArray(raw.cases)) {
      throw new Error(`Invalid eval suite JSON: ${abs}`);
    }
    return raw;
  }

  listSuiteIds(): string[] {
    if (!fs.existsSync(this.suitesRoot)) return [];
    return fs
      .readdirSync(this.suitesRoot)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/, ''));
  }
}
