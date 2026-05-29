import { Injectable, Logger } from '@nestjs/common';
import type { RoutePlanDraft, WorldModelContext } from '../shared/world-model.types';
import type { DecisionLogEntry } from '../shared/decision-result.types';
import type { DecisionResult } from '../shared/decision-result.types';
import { AbuStrategy } from '../strategies/abu-strategy.service';
import { DrDreStrategy } from '../strategies/dr-dre-strategy.service';
import { NeptuneStrategy } from '../strategies/neptune-strategy.service';
import {
  DEFAULT_PERSONA_CLOSURE_BUDGET,
  type PersonaClosureAudit,
  type PersonaClosureBudget,
  type PersonaClosureStopReason,
} from '../shared/persona-closure.types';
import { fingerprintRoutePlan, planFingerprintChanged } from '../shared/plan-fingerprint.util';
import type { StrategyOrchestrationResult } from './strategy-orchestrator.service';

function tagPersonaClosureLog(
  log: DecisionLogEntry,
  iter: number,
  phase: 'post_neptune_recheck',
): DecisionLogEntry {
  return {
    ...log,
    metadata: {
      ...(log.metadata && typeof log.metadata === 'object' ? log.metadata : {}),
      persona_closure: { iter, phase },
    },
  };
}

export function determinePersonaFinalAction(
  abuAction: string,
  dreAction: string,
  nepAction: string,
): StrategyOrchestrationResult['finalAction'] {
  if (nepAction === 'REPLACE') return 'REPLACE';
  if (dreAction === 'ADJUST') return 'ADJUST';
  return 'ALLOW';
}

@Injectable()
export class PersonaClosureLoopService {
  private readonly logger = new Logger(PersonaClosureLoopService.name);

  constructor(
    private readonly abu: AbuStrategy,
    private readonly dre: DrDreStrategy,
    private readonly nep: NeptuneStrategy,
  ) {}

  async run(
    world: WorldModelContext,
    plan: RoutePlanDraft,
    budget: PersonaClosureBudget = DEFAULT_PERSONA_CLOSURE_BUDGET,
  ): Promise<StrategyOrchestrationResult & { personaClosureAudit: PersonaClosureAudit }> {
    const audit: PersonaClosureAudit = {
      iters: [],
      stopReason: 'NO_REPLACE',
      totalAbuRechecks: 0,
    };
    const allLogs: DecisionLogEntry[] = [];
    let currentPlan = plan;
    const rejectedFingerprints = new Set<string>();

    const abuResult = await this.abu.evaluate(world, currentPlan);
    allLogs.push(...abuResult.logs);
    if (!abuResult.allowed) {
      audit.stopReason = 'ABU_FATAL_REJECT';
      return this.reject(allLogs, audit);
    }

    const dreResult = await this.dre.evaluate(world, currentPlan);
    allLogs.push(...dreResult.logs);
    if (dreResult.updatedPlan) {
      currentPlan = dreResult.updatedPlan;
    }

    const planBeforeNeptune = currentPlan;
    let nepResult = await this.nep.evaluate(world, currentPlan);
    allLogs.push(...nepResult.logs);

    let closureIter = 0;
    let dreAction = dreResult.action;
    let nepAction = nepResult.action;

    while (closureIter < budget.maxIters) {
      const candidatePlan = nepResult.updatedPlan ?? currentPlan;
      const didReplace =
        nepResult.action === 'REPLACE' && planFingerprintChanged(planBeforeNeptune, candidatePlan);

      if (!didReplace) {
        audit.stopReason = closureIter === 0 ? 'NO_REPLACE' : 'ABU_RECHECK_PASS';
        currentPlan = candidatePlan;
        break;
      }

      currentPlan = candidatePlan;
      const beforeFp = fingerprintRoutePlan(planBeforeNeptune);
      const afterFp = fingerprintRoutePlan(currentPlan);

      const abuRecheck = await this.abu.evaluate(world, currentPlan);
      audit.totalAbuRechecks += 1;
      allLogs.push(
        ...abuRecheck.logs.map((l) => tagPersonaClosureLog(l, closureIter, 'post_neptune_recheck')),
      );

      const newHardViolations = abuRecheck.logs
        .filter((l) => l.action === 'REJECT')
        .flatMap((l) => l.reasonCodes ?? []);

      const iterStop: PersonaClosureStopReason = abuRecheck.allowed ? 'ABU_RECHECK_PASS' : 'ABU_FATAL_REJECT';
      audit.iters.push({
        iter: closureIter,
        neptuneAction: 'REPLACE',
        planFingerprintBefore: beforeFp,
        planFingerprintAfter: afterFp,
        abuRecheck: abuRecheck.allowed ? 'ALLOW' : 'REJECT',
        newHardViolations,
        stopReason: iterStop,
      });

      if (abuRecheck.allowed) {
        audit.stopReason = 'ABU_RECHECK_PASS';
        if (budget.revalidateDrdreAfterAbuPass) {
          const dreRecheck = await this.dre.evaluate(world, currentPlan);
          allLogs.push(...dreRecheck.logs);
          dreAction = dreRecheck.action;
          if (dreRecheck.updatedPlan) {
            currentPlan = dreRecheck.updatedPlan;
          }
        }
        break;
      }

      rejectedFingerprints.add(afterFp);
      closureIter += 1;

      if (closureIter >= budget.maxIters || budget.maxNeptuneRetriesPerIter <= 0) {
        audit.stopReason = closureIter >= budget.maxIters ? 'ITER_LIMIT' : 'NEPTUNE_SHRINK_EXHAUSTED';
        this.logger.warn(
          `[PersonaClosure] Abu rejected Neptune patch (${afterFp}); stop=${audit.stopReason}`,
        );
        return this.reject(allLogs, audit);
      }

      let shrinkAttempts = 0;
      let shrinkSucceeded = false;
      while (shrinkAttempts < budget.maxNeptuneRetriesPerIter) {
        shrinkAttempts += 1;
        const shrinkNep = await this.nep.evaluate(world, planBeforeNeptune, {
          shrinkMode: true,
          rejectedFingerprints: [...rejectedFingerprints],
        });
        allLogs.push(...shrinkNep.logs);
        nepResult = shrinkNep;
        nepAction = shrinkNep.action;
        const shrinkPlan = shrinkNep.updatedPlan ?? planBeforeNeptune;
        const shrinkFp = fingerprintRoutePlan(shrinkPlan);
        if (
          shrinkNep.action === 'REPLACE' &&
          planFingerprintChanged(planBeforeNeptune, shrinkPlan) &&
          !rejectedFingerprints.has(shrinkFp)
        ) {
          shrinkSucceeded = true;
          break;
        }
      }

      if (!shrinkSucceeded) {
        audit.stopReason = 'NEPTUNE_SHRINK_EXHAUSTED';
        return this.reject(allLogs, audit);
      }
    }

    if (audit.stopReason === 'NO_REPLACE' && closureIter >= budget.maxIters) {
      audit.stopReason = 'ITER_LIMIT';
    }

    allLogs.push({
      persona: 'ABU',
      action: 'ALLOW',
      explanation: `persona closure stop=${audit.stopReason} rechecks=${audit.totalAbuRechecks}`,
      reasonCodes: ['PERSONA_CLOSURE', audit.stopReason],
      evidenceRefs: [],
      timestamp: new Date().toISOString(),
      decisionSource: 'PHYSICAL',
      decisionStage: 'FINALIZE',
      metadata: { personaClosureAudit: audit },
    });

    const finalAction = determinePersonaFinalAction(abuResult.action, dreAction, nepAction);
    this.logger.debug(
      `[PersonaClosure] complete stop=${audit.stopReason} rechecks=${audit.totalAbuRechecks}`,
    );

    return {
      plan: currentPlan,
      logs: allLogs,
      allowed: true,
      finalAction,
      expectedUtility: dreResult.expectedUtility,
      expectedUtilityWeights: dreResult.expectedUtilityWeights,
      personaClosureAudit: audit,
    };
  }

  private reject(
    logs: DecisionLogEntry[],
    audit: PersonaClosureAudit,
  ): StrategyOrchestrationResult & { personaClosureAudit: PersonaClosureAudit } {
    logs.push({
      persona: 'ABU',
      action: 'REJECT',
      explanation: `persona closure stop=${audit.stopReason} rechecks=${audit.totalAbuRechecks}`,
      reasonCodes: ['PERSONA_CLOSURE', audit.stopReason],
      evidenceRefs: [],
      timestamp: new Date().toISOString(),
      decisionSource: 'PHYSICAL',
      decisionStage: 'FINALIZE',
      metadata: { personaClosureAudit: audit },
    });
    return {
      plan: null,
      logs,
      allowed: false,
      finalAction: 'REJECT',
      personaClosureAudit: audit,
    };
  }
}
