import type { OrchestratorRobustnessMetadata } from '../../agent/utils/orchestrator-failure-taxonomy.util';

/**
 * Skill `execute()` 失败时抛出：携带 I5 指纹，供编排 / ExecutionIntegration 直接消费。
 */
export class SkillExecutionError extends Error {
  readonly skillName: string;
  readonly orchestratorRobustness: OrchestratorRobustnessMetadata;
  readonly cause?: unknown;

  constructor(
    skillName: string,
    message: string,
    opts: { orchestratorRobustness: OrchestratorRobustnessMetadata; cause?: unknown },
  ) {
    super(message);
    this.name = 'SkillExecutionError';
    this.skillName = skillName;
    this.orchestratorRobustness = opts.orchestratorRobustness;
    this.cause = opts.cause;
  }
}

export function isSkillExecutionError(e: unknown): e is SkillExecutionError {
  return e instanceof SkillExecutionError;
}
