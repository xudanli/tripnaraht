/**
 * Guardian workspace assertions → canonical ConstraintAssertion (Phase 2c).
 */

import { Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { ConstraintAssertion } from '../contracts/constraint-assertion';
import { GuardianConstraintProvider } from '../providers/guardian-constraint.provider';
import type { Rfc001ConstraintAssertion } from '../../../trips/guardian-decision-core/contracts/guardian-outputs.types';

const GUARDIAN_SKIP_SEMANTIC_KEYS = new Set([
  /** Covered by trip-schedule-conflicts projection */
  'EXCESSIVE_DAILY_LOAD',
]);

@Injectable()
export class GuardianFeasibilityCollectorService {
  private readonly logger = new Logger(GuardianFeasibilityCollectorService.name);

  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly guardianProvider: GuardianConstraintProvider,
  ) {}

  async collectCanonicalAssertions(tripId: string): Promise<ConstraintAssertion[]> {
    const workspaceService = this.getWorkspaceService();
    if (!workspaceService) return [];

    try {
      const workspaces = await workspaceService.list(tripId);
      const guardianAssertions = workspaces.flatMap((ws) =>
        ws.constraintAssertions.filter((a) => a.verdict !== 'PASS'),
      );
      if (!guardianAssertions.length) return [];

      return this.guardianProvider
        .evaluate({ tripId, guardianAssertions })
        .filter((a) => a.status !== 'PASS')
        .filter((a) => !this.shouldSkipAssertion(a));
    } catch (e: unknown) {
      this.logger.warn(
        `Guardian feasibility collect failed: ${e instanceof Error ? e.message : e}`,
      );
      return [];
    }
  }

  /** Dedupe keys already covered by schedule / POI gateway projections */
  filterSupplementalAssertions(
    assertions: ConstraintAssertion[],
    existingSemanticKeys: Set<string>,
  ): ConstraintAssertion[] {
    return assertions.filter((a) => {
      const key = a.evaluator.ruleId ?? a.constraintType;
      if (existingSemanticKeys.has(key)) return false;
      if (GUARDIAN_SKIP_SEMANTIC_KEYS.has(key) && this.hasDailyLoadCoverage(existingSemanticKeys)) {
        return false;
      }
      return a.status !== 'PASS';
    });
  }

  private shouldSkipAssertion(assertion: ConstraintAssertion): boolean {
    const key = assertion.evaluator.ruleId ?? assertion.constraintType;
    return GUARDIAN_SKIP_SEMANTIC_KEYS.has(key);
  }

  private hasDailyLoadCoverage(keys: Set<string>): boolean {
    return keys.has('EXCESSIVE_DAILY_LOAD') || [...keys].some((k) => k.includes('daily_drive'));
  }

  private getWorkspaceService():
    | { list: (tripId: string) => Promise<Array<{ constraintAssertions: Rfc001ConstraintAssertion[] }>> }
    | undefined {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { DecisionWorkspaceService } = require('../../../trips/guardian-decision-core/workspace/decision-workspace.service') as {
        DecisionWorkspaceService: new (...args: never[]) => {
          list: (tripId: string) => Promise<Array<{ constraintAssertions: Rfc001ConstraintAssertion[] }>>;
        };
      };
      return this.moduleRef.get(DecisionWorkspaceService, { strict: false });
    } catch {
      return undefined;
    }
  }
}
