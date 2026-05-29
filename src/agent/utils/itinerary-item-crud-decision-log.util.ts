/**
 * 绑定 Trip 行程项 CRUD 短路：决策日志与 stepsExecuted 中的 Skill 命中展示。
 */

import type { DecisionLogEntry } from '../interfaces/trip-plan.interface';

export function normalizeSkillsHit(skillsHit: string[] | undefined): string[] {
  return [...new Set((skillsHit ?? []).map((s) => String(s).trim()).filter(Boolean))];
}

export function appendSkillsHitToOutputsSummary(
  base: string,
  skillsHit: string[] | undefined,
): string {
  const skills = normalizeSkillsHit(skillsHit);
  if (!skills.length) return base;
  return `${base} 命中 Skill：${skills.join('、')}`.trim();
}

export function buildCrudSkillsDecisionMetadata(
  skillsHit: string[] | undefined,
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  const skills = normalizeSkillsHit(skillsHit);
  return {
    ...(extra ?? {}),
    ...(skills.length ? { skills_hit: skills } : {}),
  };
}

export function extractSkillsHitFromDecisionLog(
  log: DecisionLogEntry[] | undefined,
): string[] {
  const out: string[] = [];
  for (const entry of log ?? []) {
    const raw = entry.metadata?.skills_hit;
    if (Array.isArray(raw)) {
      for (const s of raw) {
        const v = String(s ?? '').trim();
        if (v) out.push(v);
      }
    }
  }
  return [...new Set(out)];
}

export function mapOrchestratorDecisionLogToStepsExecuted(
  log: DecisionLogEntry[],
  opts?: { isSuccess?: (step: string) => boolean },
): Array<{
  stepId: string;
  skillName?: string;
  actionName?: string;
  success: boolean;
  duration: number;
}> {
  return log.map((entry) => {
    const skills = normalizeSkillsHit(
      Array.isArray(entry.metadata?.skills_hit)
        ? (entry.metadata!.skills_hit as string[])
        : undefined,
    );
    return {
      stepId: entry.step,
      success: opts?.isSuccess ? opts.isSuccess(entry.step) : true,
      duration: entry.metadata?.duration_ms || 0,
      ...(skills[0] ? { skillName: skills[0] } : {}),
      ...(skills.length > 1 ? { actionName: skills.slice(1).join(', ') } : {}),
    };
  });
}
