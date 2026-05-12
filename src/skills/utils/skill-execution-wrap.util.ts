import { classifyOrchestratorFailure } from '../../agent/utils/orchestrator-failure-taxonomy.util';
import { SkillExecutionError } from '../errors/skill-execution.error';

/**
 * 统一包装 Skill 执行：任意异常 → I5 分类 → {@link SkillExecutionError}。
 *
 * 由 {@link SkillsRegistryService.registerSkill} 自动套用，调用方仍 `getSkill().execute()` 即可。
 */
export async function wrapSkillExecution<T>(
  skillName: string,
  fn: () => Promise<T>,
  ctx?: { orchestrator_step?: string },
): Promise<T> {
  try {
    return await fn();
  } catch (e: unknown) {
    const meta = classifyOrchestratorFailure(e, {
      skill_name: skillName,
      orchestrator_step: ctx?.orchestrator_step,
    });
    const msg =
      typeof e === 'object' && e !== null && 'message' in e && typeof (e as Error).message === 'string'
        ? (e as Error).message
        : String(e);
    throw new SkillExecutionError(skillName, msg, { orchestratorRobustness: meta, cause: e });
  }
}
