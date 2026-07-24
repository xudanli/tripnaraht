import { Injectable, Logger } from '@nestjs/common';
import type { EvolvableSkill, SkillTrajectory } from '../interfaces/skill-evolver.types';
import type { E2EReplayResult } from '../../../../trips/decision/evaluation/e2e-case.types';
import { isLiveDecisionReplayEnabled, runE2eReplayTrajectory } from '../utils/decision-replay-trajectory.util';

@Injectable()
export class DecisionReplayTrajectoryService {
  private readonly logger = new Logger(DecisionReplayTrajectoryService.name);

  async run(sourceE2eCaseId: string, skill: EvolvableSkill): Promise<{
    trajectory: SkillTrajectory;
    replay: E2EReplayResult;
  }> {
    const result = await runE2eReplayTrajectory(sourceE2eCaseId, skill);
    this.logger.log(
      `[DecisionReplay] ${skill.skillId} case=${sourceE2eCaseId} passed=${result.replay.passed} live=${isLiveDecisionReplayEnabled()}`,
    );
    return result;
  }
}
