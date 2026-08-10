/**
 * 前端 CTA 常注入「请使用行程规划模式」包装层，会误触发 GLOBAL_PLAN（规划…行程）。
 * 意图 / CRE 解析前须剥掉，只保留用户真实诉求。
 */

const PLANNING_MODE_WRAPPER_RE =
  /^【请使用行程规划模式】[^\n]*\n+(?:结合当前行程草案[^\n]*\n+)?/u;

const PLANNING_MODE_WRAPPER_INLINE_RE =
  /【请使用行程规划模式】[^：:\n]*[：:]\s*/gu;

export function stripPlanningModeWrapper(message: string): string {
  let t = String(message ?? '').trim();
  if (!t.includes('请使用行程规划模式')) return t;
  t = t.replace(PLANNING_MODE_WRAPPER_RE, '').trim();
  t = t.replace(PLANNING_MODE_WRAPPER_INLINE_RE, '').trim();
  /** 残留引导句 */
  t = t
    .replace(
      /^结合当前行程草案，在完整规划与校验下落实以下需求（可调整日程、交通与住宿）[：:]\s*/u,
      '',
    )
    .trim();
  return t;
}
