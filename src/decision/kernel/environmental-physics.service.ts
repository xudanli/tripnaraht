import type { VisibilityWindow } from './environmental-milp-builder';

/**
 * EnvironmentalPhysicsService (pure functions)
 *
 * Single source of truth for "sunset window" math used by:
 * - Kernel MILP builder (environmental-milp-builder)
 * - Rule engines (e.g., ConstraintsEngineService dynamic windows)
 */

export function parseTimeToMinutes(day: string, t: string): number {
  const s = String(t ?? '').trim();
  if (!s) throw new Error('empty time');
  if (s.includes('T')) {
    const d = new Date(s);
    const base = new Date(`${day}T00:00:00.000Z`);
    const ms = d.getTime() - base.getTime();
    if (!Number.isFinite(ms)) throw new Error(`bad ISO time: ${t}`);
    return Math.round(ms / 60000);
  }
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) throw new Error(`bad time: ${t}`);
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
    throw new Error(`bad time: ${t}`);
  }
  return hh * 60 + mm;
}

function hasTag(n: { tags?: string[] }, tag: string): boolean {
  const tags = n.tags ?? [];
  return Array.isArray(tags) && tags.some((t) => String(t).toLowerCase() === tag.toLowerCase());
}

/**
 * TripNARA visibility window inference: business tags -> math window.
 *
 * Priority:
 * 1) explicit node.visibilityWindow (handled by caller)
 * 2) tags / legacy flags -> derived window
 */
export function deriveVisibilityWindow(
  node: {
    tags?: string[];
    visibility_req?: boolean;
    delta_min?: number;
    aurora_offset?: number;
  },
  sunsetMin: number,
  opts: { twilightBufferMin: number; defaultAuroraOffsetMin?: number },
): VisibilityWindow | undefined {
  const window: VisibilityWindow = {};

  // 1) Photography / sunset visibility (latest end)
  // - legacy: visibility_req
  // - tags: golden_hour (or similar)
  if (node.visibility_req || hasTag(node, 'golden_hour') || hasTag(node, 'landscape_photography')) {
    const delta = Number.isFinite(node.delta_min as number) ? Number(node.delta_min) : opts.twilightBufferMin ?? 30;
    window.latestEndMin = sunsetMin + delta;
  }

  // 2) Aurora / stargazing / night view (earliest start)
  if (hasTag(node, 'aurora') || hasTag(node, 'stargazing') || hasTag(node, 'nightview') || hasTag(node, 'aurora_hunting')) {
    const offset =
      Number.isFinite(node.aurora_offset as number)
        ? Number(node.aurora_offset)
        : Math.max(0, opts.defaultAuroraOffsetMin ?? 90);
    window.earliestStartMin = Math.max(window.earliestStartMin ?? 0, sunsetMin + offset);
  }

  return window.earliestStartMin === undefined && window.latestEndMin === undefined ? undefined : window;
}

