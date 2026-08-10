/**
 * Certification harness: each P0 runbook trigger → verified proposal.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { executeIcelandDriveRunbook } from './iceland-drive-runbook.executor';
import type {
  IcelandDriveRunbookContext,
  IcelandDriveRunbookExecutionResult,
  IcelandDriveRunbookId,
} from './iceland-drive-runbook.types';

export interface RunbookCertScenario {
  scenarioId: string;
  runbookId: IcelandDriveRunbookId;
  context: IcelandDriveRunbookContext;
  expect: {
    verifiedProposal: boolean;
    createPlanVersion?: boolean;
    stepsInclude?: string[];
    prohibitedInclude?: string[];
    opsInclude?: string[];
  };
}

export interface RunbookCertBundle {
  schemaId: string;
  country: string;
  version: string;
  scenarios: RunbookCertScenario[];
}

export function loadRunbookExecutionCertScenarios(
  cwd: string = process.cwd(),
): RunbookCertBundle {
  const path = join(
    cwd,
    'data/destination-packs/is/certification/knowledge-pack/runbooks/runbook-execution.scenarios.json',
  );
  return JSON.parse(readFileSync(path, 'utf8')) as RunbookCertBundle;
}

export function runRunbookExecutionCertification(
  cwd: string = process.cwd(),
): {
  schemaId: 'tripnara.iceland.drive_runbook.cert.report@v1';
  total: number;
  passed: number;
  failed: number;
  results: Array<{
    scenarioId: string;
    passed: boolean;
    actual?: IcelandDriveRunbookExecutionResult;
    message?: string;
  }>;
} {
  const bundle = loadRunbookExecutionCertScenarios(cwd);
  const results = bundle.scenarios.map((scenario) => {
    const actual = executeIcelandDriveRunbook(
      scenario.runbookId,
      scenario.context,
      cwd,
    );
    const problems: string[] = [];
    if (actual.verifiedProposal !== scenario.expect.verifiedProposal) {
      problems.push(
        `verifiedProposal expected ${scenario.expect.verifiedProposal}, got ${actual.verifiedProposal}`,
      );
    }
    if (
      scenario.expect.createPlanVersion != null &&
      actual.createPlanVersion !== scenario.expect.createPlanVersion
    ) {
      problems.push('createPlanVersion mismatch');
    }
    for (const step of scenario.expect.stepsInclude ?? []) {
      if (!actual.stepsCompleted.includes(step)) {
        problems.push(`missing step ${step}`);
      }
    }
    for (const code of scenario.expect.prohibitedInclude ?? []) {
      if (!actual.prohibitedActions.includes(code)) {
        problems.push(`missing prohibited ${code}`);
      }
    }
    for (const op of scenario.expect.opsInclude ?? []) {
      if (!actual.candidateOperations.includes(op as never)) {
        problems.push(`missing op ${op}`);
      }
    }
    return {
      scenarioId: scenario.scenarioId,
      passed: problems.length === 0,
      actual,
      message: problems.length ? problems.join('; ') : undefined,
    };
  });

  const passed = results.filter((r) => r.passed).length;
  return {
    schemaId: 'tripnara.iceland.drive_runbook.cert.report@v1',
    total: results.length,
    passed,
    failed: results.length - passed,
    results,
  };
}
