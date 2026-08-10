/**
 * 获取可用 Skills 列表（从 ClaudeOrchestrator 迁出）。
 */

import type { AvailableSkillsHost } from './available-skills.host';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';

export function getAvailableSkills(
  host: AvailableSkillsHost,
  emergencyConstraints?: RouteAndRunRequestDto['emergency_constraints'],
): Array<{ name: string; description: string }> {
  if (!host.skillsRegistry) {
    host.logger.warn('[Claude Orchestrator] SkillsRegistry 未注入，返回空列表');
    return [];
  }

  try {
    const allSkills =
      typeof host.skillsRegistry.getAllSkillsForEmergencyConstraints === 'function'
        ? host.skillsRegistry.getAllSkillsForEmergencyConstraints(emergencyConstraints)
        : host.skillsRegistry.getAllSkills();
    host.logger.debug(`[Claude Orchestrator] 获取到 ${allSkills.length} 个可用 Skills`);

    return allSkills.map((skill: any) => ({
      name: skill?.metadata?.name || 'unknown',
      description: skill?.metadata?.description || 'No description',
    }));
  } catch (error: any) {
    host.logger.error(`[Claude Orchestrator] 获取 Skills 失败: ${error?.message}`, error?.stack);
    return [];
  }
}
