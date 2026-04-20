import { Injectable } from '@nestjs/common';
import type { HarnessDeterministicValidator } from '../validators/deterministic/deterministic-validator.interface';
import { HarnessIdempotencyKeyValidator } from '../validators/deterministic/idempotency-key.validator';
import { HarnessEvidenceVersionBindingValidator } from '../validators/deterministic/evidence-version-binding.validator';
import { HarnessGateBeforePlanValidator } from '../validators/deterministic/gate-before-plan.validator';
import { HarnessResearchSnapshotPresentValidator } from '../validators/deterministic/research-snapshot-present.validator';
import { HarnessItineraryDateContinuityValidator } from '../validators/deterministic/itinerary-date-continuity.validator';
import { HarnessBudgetOverrunValidator } from '../validators/deterministic/budget-overrun.validator';
import { HarnessUserIntentBudgetValidator } from '../validators/deterministic/user-intent-budget.validator';
import { HarnessSystemRequestIdValidator } from '../validators/deterministic/system-request-id.validator';
import type { HarnessExecutionContext } from './execution-context.types';
import type { HarnessValidationResult } from '../contracts/validation.types';

@Injectable()
export class HarnessDeterministicValidatorsFacade {
  private readonly byName: Map<string, HarnessDeterministicValidator>;

  constructor(
    idempotency: HarnessIdempotencyKeyValidator,
    evidenceBind: HarnessEvidenceVersionBindingValidator,
    gateBeforePlan: HarnessGateBeforePlanValidator,
    researchSnapshotPresent: HarnessResearchSnapshotPresentValidator,
    itineraryDateContinuity: HarnessItineraryDateContinuityValidator,
    budgetOverrun: HarnessBudgetOverrunValidator,
    userIntentBudget: HarnessUserIntentBudgetValidator,
    systemRequestId: HarnessSystemRequestIdValidator,
  ) {
    this.byName = new Map<string, HarnessDeterministicValidator>([
      [idempotency.name, idempotency],
      [evidenceBind.name, evidenceBind],
      [gateBeforePlan.name, gateBeforePlan],
      [researchSnapshotPresent.name, researchSnapshotPresent],
      [itineraryDateContinuity.name, itineraryDateContinuity],
      [budgetOverrun.name, budgetOverrun],
      [userIntentBudget.name, userIntentBudget],
      [systemRequestId.name, systemRequestId],
    ]);
  }

  async runAll(
    names: string[],
    input: unknown,
    context: HarnessExecutionContext,
  ): Promise<HarnessValidationResult[]> {
    const out: HarnessValidationResult[] = [];
    for (const n of names) {
      const v = this.byName.get(n);
      if (!v) {
        out.push({
          passed: false,
          severity: 'L2',
          code: 'VALIDATOR_NOT_REGISTERED',
          message: `Deterministic validator not registered: ${n}`,
          details: { name: n },
        });
        continue;
      }
      out.push(await Promise.resolve(v.validate(input, context)));
    }
    return out;
  }
}
