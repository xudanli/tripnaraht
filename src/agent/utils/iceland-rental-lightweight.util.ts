/**
 * 轻量路径：冰岛租车 Guidance Skill 与 Booking MCP 的「双路合并」展示辅助。
 */

import type { IcelandRentalGuidanceOutput } from '../../skills/world/iceland-rental-guidance.skill';

/** 注入 LLM 上下文的决策层摘录（与 Booking 实时块并列） */
export function buildIcelandRentalGuidancePromptLines(g: IcelandRentalGuidanceOutput): string[] {
  const topBrands = g.trusted_local_providers
    .slice(0, 3)
    .map((p) => `${p.name}（tags: ${p.trust_tags.join(', ')}）`)
    .join('；');
  return [
    `【冰岛租车决策 Skill｜iceland.rentalGuidance｜intent_profile=${g.intent_profile}】${g.summary_zh}`,
    `本地品牌优先参考（已按画像排序）：${topBrands}。`,
    `保险自检（脚注级，勿替代 Booking 条款）：${g.insurance_checklist_zh.join(' ')}`,
    `车型与路况：${g.vehicle_policy_hints_zh.join(' ')}`,
    `官方风险入口：${g.risk_control.road_is.label} ${g.risk_control.road_is.url}；${g.risk_control.vedur.label} ${g.risk_control.vedur.url}；${g.risk_control.safetravel.label} ${g.risk_control.safetravel.url}。${g.risk_control.vegagerdin_app_zh}`,
    '若上文含「实时租车检索 MCP」摘录：请在概括车型/价格后，用短段落引用本块「信任标签 + 保险避坑」作附注，明确实时价以平台为准。',
  ];
}

/** 供前端挂在 Booking 卡片下的脚注文案（纯字符串数组） */
export function buildCarRentalGuidanceFootnotesZh(g: IcelandRentalGuidanceOutput): string[] {
  const lines: string[] = [`【冰岛租车决策层】${g.summary_zh}`];
  for (const p of g.trusted_local_providers.slice(0, 4)) {
    lines.push(
      `「${p.name}」｜信任标签：${p.trust_tags.join('、')}｜保险：${p.insurance_notes_zh.join('；')}｜F-road/风：${p.f_road_notes_zh.join('；')}`,
    );
  }
  lines.push(`【保险清单】${g.insurance_checklist_zh.join(' ')}`);
  lines.push(`【横风/开门与 F-road】${g.vehicle_policy_hints_zh.join(' ')}`);
  lines.push(`【聚合比价入口】${g.aggregation_portals.map((x) => x.name).join('、')}（详见 skill 载荷 links）`);
  return lines;
}
