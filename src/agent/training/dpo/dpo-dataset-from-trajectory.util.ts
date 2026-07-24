/**
 * 将 RLTrajectory 转为 HuggingFace / TRL 常见 DPO JSONL 行（prompt, chosen, rejected）。
 * 启发式：从末步 alternatives_considered 与 user_approval / 评分构造偏好对；无足够信号则跳过。
 */

import type { RLTrajectory, RLTrajectoryStep } from '../interfaces/trajectory.interface';

export interface DpoPreferenceJsonlRecord {
  prompt: string;
  chosen: string;
  rejected: string;
  trajectory_id: string;
  request_id?: string;
}

function clampStr(s: unknown, max = 8000): string {
  const t = typeof s === 'string' ? s : JSON.stringify(s ?? '');
  return t.length <= max ? t : `${t.slice(0, max)}…[truncated]`;
}

function pickPrompt(t: RLTrajectory): string {
  const s0 = t.steps[0]?.state;
  const u = s0?.user_request;
  if (typeof u === 'string' && u.trim()) return u.trim();
  return `trip_planning:${t.request_id ?? t.trajectory_id}`;
}

function lastMeaningfulStep(steps: RLTrajectoryStep[]): RLTrajectoryStep | undefined {
  for (let i = steps.length - 1; i >= 0; i--) {
    const alts = steps[i]?.action?.alternatives_considered;
    if (Array.isArray(alts) && alts.length >= 2) return steps[i];
  }
  return steps[steps.length - 1];
}

/**
 * 每条轨迹最多产出 0 或 1 条 DPO 记录（可扩展为多步时循环调用）。
 */
export function trajectoriesToDpoPreferenceRecords(trajectories: RLTrajectory[]): DpoPreferenceJsonlRecord[] {
  const out: DpoPreferenceJsonlRecord[] = [];

  for (const t of trajectories) {
    if (!t?.steps?.length) continue;
    const step = lastMeaningfulStep(t.steps);
    if (!step) continue;

    const alts = step.action?.alternatives_considered;
    if (!Array.isArray(alts) || alts.length < 2) continue;

    const scored = alts
      .map((a: { option?: unknown; score?: number }, idx: number) => ({
        text: clampStr(a?.option ?? alts[idx]),
        score: typeof a?.score === 'number' && Number.isFinite(a.score) ? a.score : undefined,
      }))
      .filter((x) => x.text.length > 0);

    if (scored.length < 2) continue;

    const withScore = scored.filter((x) => x.score !== undefined) as Array<{ text: string; score: number }>;
    let chosen: string;
    let rejected: string;

    if (withScore.length >= 2) {
      const sorted = [...withScore].sort((a, b) => b.score - a.score);
      chosen = sorted[0].text;
      rejected = sorted[sorted.length - 1].text;
    } else {
      const ua = String(step.reward?.user_approval ?? '');
      const userRejected = ua === 'REJECTED';
      chosen = userRejected ? scored[1].text : scored[0].text;
      rejected = userRejected ? scored[0].text : scored[1].text;
    }

    if (chosen === rejected) continue;

    out.push({
      prompt: pickPrompt(t),
      chosen,
      rejected,
      trajectory_id: t.trajectory_id,
      request_id: t.request_id,
    });
  }

  return out;
}
