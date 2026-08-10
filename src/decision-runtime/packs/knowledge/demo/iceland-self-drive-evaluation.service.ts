/**
 * Nest-facing facade for Gateway / Solver / Execution Risk consumers.
 */

import { Injectable } from '@nestjs/common';
import { evaluateIcelandSelfDriveSituation } from './evaluate-iceland-self-drive-situation';
import type {
  IcelandSelfDriveSituationInput,
  IcelandSelfDriveSituationResult,
} from './iceland-self-drive-situation.types';
import {
  runDemoReplayScenario,
  runIcelandSelfDriveDemoCertification,
  loadDemoReplayScenarios,
} from './demo-replay.harness';
import { runIcelandSelfDriveKnowledgePackCertification } from './knowledge-pack-certification.rollup';

@Injectable()
export class IcelandSelfDriveEvaluationService {
  evaluate(
    input: IcelandSelfDriveSituationInput,
  ): IcelandSelfDriveSituationResult {
    return evaluateIcelandSelfDriveSituation(input);
  }

  runDemoScenario(scenarioId: string): IcelandSelfDriveSituationResult {
    const bundle = loadDemoReplayScenarios();
    const scenario = bundle.scenarios.find((s) => s.scenarioId === scenarioId);
    if (!scenario) {
      throw new Error(`Unknown demo scenario: ${scenarioId}`);
    }
    return runDemoReplayScenario(scenario);
  }

  listDemoScenarios(): Array<{ scenarioId: string; title: string }> {
    return loadDemoReplayScenarios().scenarios.map((s) => ({
      scenarioId: s.scenarioId,
      title: s.title,
    }));
  }

  runDemoCertification() {
    return runIcelandSelfDriveDemoCertification();
  }

  runFullKnowledgePackCertification() {
    return runIcelandSelfDriveKnowledgePackCertification();
  }
}
