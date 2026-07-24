/**
 * 体能画像 → 提示文案（单一事实源）：由 Hydrator 写入的 `travelPreference.request_fitness_*` 派生，
 * 供轻量咨询与完整状态机 INTAKE 共用。
 */

export const REQUEST_FITNESS_PROFILE_LINES_KEY = '__requestFitnessProfileLines';

/** 完整编排：INTAKE 并入 `tripPlanRequest.message` 的英文 Expert 块（与轻量路径数字一致）。 */
export const PHYSICAL_CAPABILITY_SYSTEM_HINT_KEY = '__physicalCapabilitySystemHint';

function parsePartyMeta(pref: Record<string, unknown> | null | undefined): {
  partyTotal: number | null;
  hasElderly: boolean;
  hasChildren: boolean;
} {
  if (!pref) return { partyTotal: null, hasElderly: false, hasChildren: false };
  const raw = pref.route_party_total;
  const partyTotal =
    typeof raw === 'number' && Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : null;
  return {
    partyTotal,
    hasElderly: pref.route_has_elderly === true,
    hasChildren: pref.route_has_children === true,
  };
}

/** 1.0：无多人聚合数据时，用提示语约束模型按「木桶」保守推理。 */
export function needsGroupTripFitnessDisclaimer(pref: Record<string, unknown> | null | undefined): boolean {
  const { partyTotal, hasElderly, hasChildren } = parsePartyMeta(pref);
  if (hasElderly || hasChildren) return true;
  if (partyTotal != null && partyTotal > 1) return true;
  return false;
}

export function buildFitnessProfileLinesZhFromTravelPreference(
  pref: Record<string, unknown> | null | undefined,
): string[] | null {
  if (!pref || pref.request_fitness_overall_score == null) return null;
  const score = Number(pref.request_fitness_overall_score);
  if (!Number.isFinite(score)) return null;

  const levelEnum = String(pref.request_fitness_level_enum ?? '');
  const levelDesc =
    typeof pref.request_fitness_level_description_zh === 'string'
      ? pref.request_fitness_level_description_zh
      : '';
  const conf = String(pref.request_fitness_confidence ?? '');
  const confDesc =
    typeof pref.request_fitness_confidence_description_zh === 'string'
      ? pref.request_fitness_confidence_description_zh
      : '';
  const ascent = Number(pref.request_fitness_recommended_daily_ascent_m);
  const dist = Number(pref.request_fitness_recommended_daily_distance_km);
  const dim = pref.request_fitness_dimensions as
    | { climbingAbility?: number; endurance?: number; recoverySpeed?: number }
    | undefined;
  const climb = dim?.climbingAbility != null ? Number(dim.climbingAbility) : NaN;
  const end = dim?.endurance != null ? Number(dim.endurance) : NaN;
  const rec = dim?.recoverySpeed != null ? Number(dim.recoverySpeed) : NaN;
  const mapped = String(pref.request_fitness_mapped_route_level ?? '');
  const showMappedHint = pref.request_fitness_show_mapped_band_hint === true;

  const lines = [
    '【用户体能画像（来自问卷/系统评估；本轮即时载入，勿声称无法读取）】',
    levelDesc
      ? `综合评分 ${score}/100；系统等级 ${levelEnum}（${levelDesc}）`
      : `综合评分 ${score}/100；系统等级 ${levelEnum}`,
    confDesc ? `置信度：${conf} — ${confDesc}` : `置信度：${conf}`,
  ];
  if (Number.isFinite(ascent) && Number.isFinite(dist)) {
    lines.push(
      `推荐单日体力参考：爬升约 ${ascent} m，平地/混合路况行走约 ${dist} km（为规划软参考，非医疗结论）`,
    );
  }
  if (Number.isFinite(climb) && Number.isFinite(end) && Number.isFinite(rec)) {
    lines.push(`维度分（爬升能力 / 耐力 / 恢复）：${climb} / ${end} / ${rec}`);
  }
  if (showMappedHint && mapped) {
    lines.push(`与 route_and_run 对齐的体能档位（供 VERIFY/强度假设）：${mapped}（由画像映射）`);
  }
  if (needsGroupTripFitnessDisclaimer(pref)) {
    lines.push(
      '【多人出行提示】上述单日爬升/距离等数据仅反映主账号用户本人。若本次为多人同行，或包含老人/儿童，评估路线难度时须按同行中最弱者的能力保守处理；缺少每位同行者的个体画像时，应优先采用更保守、可撤退的方案，不得把主账号数字当作全队上限。',
    );
  }
  return lines;
}

/**
 * 英文物理能力约束块：进入状态机后随 `trip_plan_request.message` 传播，各子阶段 LLM 可见。
 *
 * --- 扩展槽（ToV / 灰度后补丁，1.0 Freeze 不实现）---
 * - High-risk mismatch：可在本函数 return 前追加「Strategic Empathy Directive」短段：
 *   Acknowledge ambition → Quantify gap vs profile ceilings → Offer ladder（可执行替代），避免医疗/法律化措辞。
 * - 用语边界：用 capacity / planning buffer / guardrails，避免 heart risk、medical advice 等表述。
 */
export function buildPhysicalCapabilityConstraintBlockEnFromTravelPreference(
  pref: Record<string, unknown> | null | undefined,
): string {
  if (!pref || pref.request_fitness_overall_score == null) return '';
  const score = Number(pref.request_fitness_overall_score);
  if (!Number.isFinite(score)) return '';

  const ascent = Number(pref.request_fitness_recommended_daily_ascent_m);
  const dist = Number(pref.request_fitness_recommended_daily_distance_km);
  const level = String(pref.request_fitness_mapped_route_level ?? '');
  const mismatch = pref.request_fitness_explicit_vs_profile_mismatch === true;
  const enumLv = String(pref.request_fitness_level_enum ?? '');

  const lines = [
    '### [PHYSICAL_CAPABILITY_CONSTRAINT]',
    `- Overall score: ${score}/100 (profile enum: ${enumLv || 'n/a'})`,
  ];
  if (Number.isFinite(ascent)) lines.push(`- Recommended max daily ascent (planning ceiling): ${ascent}m`);
  if (Number.isFinite(dist)) lines.push(`- Recommended max daily distance (planning ceiling): ${dist}km`);
  if (level) {
    lines.push(
      `- Mapped route band (low|medium|high): ${level}${mismatch ? ' (explicit request fitness_level overrides mapped band for execution)' : ''}`,
    );
  }
  lines.push(
    '- Use the above as **planning-intensity guardrails** for day-level hiking/load when comparing routes or pacing (not medical advice).',
  );

  if (needsGroupTripFitnessDisclaimer(pref)) {
    const { partyTotal, hasElderly, hasChildren } = parsePartyMeta(pref);
    const labelParts: string[] = [];
    if (partyTotal != null && partyTotal > 1) labelParts.push(`${partyTotal} people`);
    if (hasElderly) labelParts.push('elderly companions');
    if (hasChildren) labelParts.push('children');
    const groupLabel = labelParts.length > 0 ? labelParts.join('; ') : 'group / sensitive-composition';
    const metrics =
      Number.isFinite(ascent) && Number.isFinite(dist)
        ? `${ascent}m daily ascent ceiling / ${dist}km daily distance ceiling`
        : 'the daily ascent/distance ceilings above';
    lines.push('');
    lines.push('### [Dynamic Safety Note — Group travel]');
    lines.push(
      `The physical profile (${metrics}) reflects ONLY the primary (logged-in) user. This itinerary context indicates: ${groupLabel}.`,
    );
    lines.push(
      'You MUST evaluate route difficulty for the weakest plausible member. If explicit per-member capability data is missing, prioritize the **most conservative** feasible pacing and safer alternatives; do not treat primary-user ceilings as a team guarantee.',
    );
  }

  return lines.join('\n').trim();
}
