import { classifyOrchestratorFailure } from '../../agent/utils/orchestrator-failure-taxonomy.util';
import { SkillExecutionError } from '../errors/skill-execution.error';
import type { SkillTokenContext } from '../interfaces/skill.interface';
import { getSkillExecutionRecorder } from '../services/skill-execution-recorder.bridge';

/**
 * 统一包装 Skill 执行：任意异常 → I5 分类 → {@link SkillExecutionError}。
 * 成功/失败均写入 skill_execution_logs（与 ALS request_id 对齐）。
 *
 * 由 {@link SkillsRegistryService.registerSkill} 自动套用，调用方仍 `getSkill().execute()` 即可。
 */
export async function wrapSkillExecution<T>(
  skillName: string,
  fn: () => Promise<T>,
  ctx?: {
    orchestrator_step?: string;
    tokenContext?: SkillTokenContext;
    category?: string;
  },
): Promise<T> {
  const started = Date.now();
  const recorder = getSkillExecutionRecorder();
  const resolved = recorder?.resolveContext({
    request_id: ctx?.tokenContext?.request_id,
    state_machine_step: ctx?.orchestrator_step ?? ctx?.tokenContext?.state_machine_step,
    sub_agent: ctx?.tokenContext?.sub_agent,
    category: ctx?.category,
  });

  const emit = (success: boolean, error?: string) => {
    if (!recorder || !resolved) return;
    recorder.record({
      request_id: resolved.request_id,
      span_id: `skill-${skillName}-${started}`,
      skill_name: skillName,
      step_name: resolved.step_name,
      sub_agent: resolved.sub_agent,
      route_path: resolved.route_path,
      category: ctx?.category,
      success,
      duration_ms: Date.now() - started,
      error,
    });
  };

  try {
    const result = await fn();
    emit(true);
    return result;
  } catch (e: unknown) {
    const meta = classifyOrchestratorFailure(e, {
      skill_name: skillName,
      orchestrator_step: ctx?.orchestrator_step,
    });
    const msg =
      typeof e === 'object' && e !== null && 'message' in e && typeof (e as Error).message === 'string'
        ? (e as Error).message
        : String(e);
    emit(false, msg);
    throw new SkillExecutionError(skillName, msg, { orchestratorRobustness: meta, cause: e });
  }
}
