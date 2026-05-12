/**
 * 将 LLM 选出的 itinerary.verify / repair.apply 收拢为 itinerary.smart_update，
 * 降低多轮调度并保持 VERIFY→REPAIR 在同一 execute 闭环内（telemetry 一致）。
 */

import type { ExecutionPlan, ExecutionStep, SkillsPlan } from '../interfaces/claude-orchestration.interface';

const SKILL_VERIFY = 'itinerary.verify';
const SKILL_REPAIR = 'repair.apply';
const SKILL_SMART = 'itinerary.smart_update';

function pruneSkillsPlanDependencyKeys(skillsPlan: SkillsPlan, removedSkillNames: string[]): void {
  const d = skillsPlan.dependencies;
  if (!d || !removedSkillNames.length) return;
  for (const k of removedSkillNames) {
    delete d[k];
  }
  for (const nk of Object.keys(d)) {
    d[nk] = (d[nk] ?? []).filter((x) => !removedSkillNames.includes(x));
  }
}

/** 将 dependencies 中引用的 skill 名从 from 改为 to（verify 单步升级为 smart 时用） */
export function renameSkillsPlanDependencySkillName(skillsPlan: SkillsPlan, from: string, to: string): void {
  const d = skillsPlan.dependencies;
  if (!d) return;
  if (d[from]) {
    d[to] = [...new Set([...(d[to] ?? []), ...d[from]])];
    delete d[from];
  }
  for (const nk of Object.keys(d)) {
    d[nk] = [...new Set((d[nk] ?? []).map((x) => (x === from ? to : x)))];
  }
}

/** 与 selectedSkills 顺序对齐 executionOrder，避免残留 verify/repair 名 */
export function syncSkillsPlanExecutionOrderFromSelected(skillsPlan: SkillsPlan): void {
  skillsPlan.executionOrder = skillsPlan.selectedSkills.map((s) => s.skillName).filter(Boolean) as string[];
}

/**
 * Skills 选择结果：去重/合并 verify+repair → smart_update
 */
export function normalizeSkillsPlanCoalesceVerifyRepair(skillsPlan: SkillsPlan): void {
  const sel = skillsPlan.selectedSkills;
  if (!sel?.length) return;

  const hasSmart = sel.some((x) => x.skillName === SKILL_SMART);
  const iV = sel.findIndex((x) => x.skillName === SKILL_VERIFY);
  const iR = sel.findIndex((x) => x.skillName === SKILL_REPAIR);

  if (hasSmart) {
    const removed = [SKILL_VERIFY, SKILL_REPAIR].filter((n) => sel.some((s) => s.skillName === n));
    skillsPlan.selectedSkills = sel.filter((x) => x.skillName !== SKILL_VERIFY && x.skillName !== SKILL_REPAIR);
    pruneSkillsPlanDependencyKeys(skillsPlan, removed);
    syncSkillsPlanExecutionOrderFromSelected(skillsPlan);
    return;
  }

  if (iV >= 0 && iR >= 0) {
    const a = sel[iV];
    const b = sel[iR];
    const mergedInput = { ...(a.input ?? {}), ...(b.input ?? {}) };
    const merged = {
      skillName: SKILL_SMART,
      reason: '编排器默认：itinerary.verify + repair.apply → itinerary.smart_update',
      priority: Math.min(a.priority ?? 99, b.priority ?? 99),
      input: mergedInput,
      dependencies: [...new Set([...(a.dependencies ?? []), ...(b.dependencies ?? [])])],
    };
    const filtered = sel.filter((x) => x.skillName !== SKILL_VERIFY && x.skillName !== SKILL_REPAIR);
    filtered.splice(Math.min(iV, iR), 0, merged);
    skillsPlan.selectedSkills = filtered;
    pruneSkillsPlanDependencyKeys(skillsPlan, [SKILL_VERIFY, SKILL_REPAIR]);
  } else if (iV >= 0) {
    sel[iV] = {
      ...sel[iV],
      skillName: SKILL_SMART,
      reason: sel[iV].reason || '编排器默认：itinerary.verify → itinerary.smart_update',
      input: { ...(sel[iV].input ?? {}) },
    };
    renameSkillsPlanDependencySkillName(skillsPlan, SKILL_VERIFY, SKILL_SMART);
  }

  syncSkillsPlanExecutionOrderFromSelected(skillsPlan);
}

function isSkillStep(name: string) {
  return (s: ExecutionStep) => s.type === 'skill' && s.skillName === name;
}

function remapStepDependencies(plan: ExecutionPlan, removedIds: string[], survivorId: string): void {
  for (const s of plan.steps) {
    s.dependencies = [
      ...new Set(
        s.dependencies.flatMap((d) => (removedIds.includes(d) ? [survivorId] : [d])),
      ),
    ].filter((d) => d && d !== s.id);
  }
}

/**
 * 执行计划：去重/合并 verify+repair 步骤为 smart_update（依赖 id 重写）
 */
export function normalizeExecutionPlanCoalesceVerifyRepair(plan: ExecutionPlan): void {
  const steps = plan.steps;
  if (!steps?.length) return;

  const idxS = steps.findIndex(isSkillStep(SKILL_SMART));
  const idxV = steps.findIndex(isSkillStep(SKILL_VERIFY));
  const idxR = steps.findIndex(isSkillStep(SKILL_REPAIR));

  if (idxS >= 0) {
    const smart = steps[idxS];
    const removed = steps.filter((s) => isSkillStep(SKILL_VERIFY)(s) || isSkillStep(SKILL_REPAIR)(s)).map((s) => s.id);
    if (!removed.length) return;
    plan.steps = steps.filter((s) => !removed.includes(s.id));
    remapStepDependencies(plan, removed, smart.id);
    return;
  }

  if (idxV >= 0 && idxR >= 0) {
    const v = steps[idxV];
    const r = steps[idxR];
    const merged: ExecutionStep = {
      ...v,
      skillName: SKILL_SMART,
      input: { ...(v.input ?? {}), ...(r.input ?? {}) },
      dependencies: [...new Set([...(v.dependencies ?? []), ...(r.dependencies ?? [])])].filter((d) => d !== v.id && d !== r.id),
    };
    const removedIds = [r.id];
    plan.steps = steps.map((s) => (s.id === r.id ? null : s.id === v.id ? merged : s)).filter(Boolean) as ExecutionStep[];
    remapStepDependencies(plan, removedIds, merged.id);
    return;
  }

  if (idxV >= 0) {
    steps[idxV].skillName = SKILL_SMART;
  }
}
