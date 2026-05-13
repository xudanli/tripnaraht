import type { EbpNarrativeStance, ResearchConflictNegotiationReport } from '../teams/research/research-conflict-negotiation.types';
import type { NarrationVoiceToneModifier } from '../../decision/kernel/interfaces/phase-executor.interface';
import {
  FRUSTRATION_CIRCUIT_BREAKER_THRESHOLD,
  TOLERANCE_BONUS_LOSS_GAIN_FRAMING_THRESHOLD,
} from '../memory/emotional-resonance/emotional-resonance.constants';

/** 5.1：从 `research_data` 读取预算仲裁二次聚账后的节省额度（元或与上游一致）。 */
export function extractBudgetAggregateSavingsFromResearchData(
  researchData: Record<string, unknown> | undefined,
): number | undefined {
  if (!researchData) return undefined;
  const g = researchData.__research_global_financial_report as { budget_aggregate_savings?: number } | undefined;
  if (typeof g?.budget_aggregate_savings === 'number' && g.budget_aggregate_savings > 0) {
    return g.budget_aggregate_savings;
  }
  const raw = researchData.__research_budget_arbitration_decision_log;
  if (!Array.isArray(raw) || !raw.length) return undefined;
  const last = raw[raw.length - 1] as { financial_impact?: { budget_savings?: number } } | undefined;
  const s = last?.financial_impact?.budget_savings;
  if (typeof s === 'number' && s > 0) return s;
  return undefined;
}

/** `primary_narrative_stance` → `NarrationLike.voice_tone_modifier`（BALANCED 不覆盖，保持亲和默认）。 */
export function mapStanceToVoiceModifier(stance: EbpNarrativeStance): NarrationVoiceToneModifier | undefined {
  switch (stance) {
    case 'COMPLIANCE_FIRST':
      return 'professional_authoritative';
    case 'STITCH_TRANSPARENCY':
      return 'reassuring_transparency';
    case 'COMMERCE_OVER_EXPERIENCE':
      return 'rational_economical';
    case 'BALANCED':
    default:
      return undefined;
  }
}

/** 6.1：挫败感熔断或 Loss-Gain 情绪对冲的中文指令块（供 `buildEbpToneMannerInstructionZh` 拼接）。 */
export function buildEmpathicValueFramingInstructionZh(
  report: ResearchConflictNegotiationReport | undefined | null,
  opts?: Readonly<{ budget_savings_yuan?: number }>,
): string {
  if (!report) return '';

  const savingsYuan = opts?.budget_savings_yuan;
  const frustration = report.user_emotional_account?.frustration_score ?? 0;
  const frustrationCircuit =
    report.mental_offset_hints?.frustration_circuit_active === true ||
    frustration >= FRUSTRATION_CIRCUIT_BREAKER_THRESHOLD;

  if (frustrationCircuit) {
    return [
      '',
      '【6.1·歉意恢复（挫败感熔断）】',
      '- 用户近期反馈或挫败信号偏高：语气须转为安抚与稳健，**禁止**单纯「表功式」强调省钱；优先承认不便与不确定性。',
      '- 若确有预算节余，只用 1 句轻描淡写带过，重心放在「行程可执行性」「数据来源可追溯」「建议下一步稳妥核验」。',
      '- 禁止用情感话术诱导用户接受新增风险；舒适度取舍仍应透明，但不做促销式庆祝。',
    ].join('\n');
  }

  const tolerance = report.tolerance_bonus ?? report.mental_offset_hints?.tolerance_bonus ?? 0;
  const hasStitchContext =
    report.conflict_flags.includes('SUTURE_COEXISTENCE') || report.primary_narrative_stance === 'STITCH_TRANSPARENCY';

  if (tolerance > TOLERANCE_BONUS_LOSS_GAIN_FRAMING_THRESHOLD && hasStitchContext) {
    const savingsLine =
      typeof savingsYuan === 'number' && savingsYuan > 0
        ? `若与事实一致，可量化「约节省 ¥${Math.round(savingsYuan)}」一类表述；`
        : '若无可靠节省数字，则只谈「性价比与可复核取舍」，不编造金额；';
    return [
      '',
      '【6.1·情绪对冲·Loss-Gain 叙事】',
      '- 存在数据缝合/新鲜度或舒适度取舍且容忍度溢价已抬升：必须采用「先具体承认不便 → 再用可复核收益对冲」的结构（各 1 句，自然中文口语）。',
      `- ${savingsLine}后半句给出与目的地/动线一致、可复核的体验建议（如就近早餐动线），**禁止**编造未证实的点名餐厅或「米其林」等标签。`,
      '- **不得**用此法淡化安全、合规或数据来源风险；不适用的场景跳过本块，回到标准透明叙事。',
    ].join('\n');
  }

  return '';
}

/** 5.1：在 EBP 映射之上叠加「省钱报喜」语气（与紧缩重跑 / 二次聚账对齐）；6.1：挫败感熔断时优先共情安抚。 */
export function mapVoiceToneModifierForNegotiationAndBudget(
  report: ResearchConflictNegotiationReport | undefined | null,
  researchData?: Record<string, unknown> | null,
): NarrationVoiceToneModifier | undefined {
  if (report) {
    const fr = report.user_emotional_account?.frustration_score ?? 0;
    const frustrationCircuit =
      report.mental_offset_hints?.frustration_circuit_active === true ||
      fr >= FRUSTRATION_CIRCUIT_BREAKER_THRESHOLD;
    if (frustrationCircuit) return 'empathetic_reassurance';
  }

  const savings = extractBudgetAggregateSavingsFromResearchData(researchData ?? undefined);
  const base = mapReportToVoiceToneModifier(report);
  if (savings !== undefined && savings > 0) {
    if (base === undefined || base === 'neutral' || base === 'reassuring_transparency') return 'rational_frugal';
    return base;
  }
  return base;
}

/** 从完整协商报告推导语气修饰符（无冲突且 BALANCED 时不强加）。 */
export function mapReportToVoiceToneModifier(
  report: ResearchConflictNegotiationReport | undefined | null,
): NarrationVoiceToneModifier | undefined {
  if (!report) return undefined;
  if (!report.has_conflicts && report.primary_narrative_stance === 'BALANCED') return undefined;
  return mapStanceToVoiceModifier(report.primary_narrative_stance);
}

/** 供 Prompt / 调试：将 EBP 立场映射为可读的「情感—文本」侧写 */
export type NarratorEmotionalStanceProfile = {
  stance: EbpNarrativeStance | 'NONE';
  core_emotion_zh: string;
  text_strategy_zh: string;
  modulation_zh: string;
};

export function getEmotionalStance(
  report: ResearchConflictNegotiationReport | undefined | null,
): NarratorEmotionalStanceProfile | undefined {
  if (!report) return undefined;
  const s = report.primary_narrative_stance;
  if (!report.has_conflicts && s === 'BALANCED') {
    return {
      stance: 'NONE',
      core_emotion_zh: '平稳、可信',
      text_strategy_zh: '信息清晰、少夸张；可适度体现行程亮点',
      modulation_zh: '正常语速与亮度',
    };
  }
  switch (s) {
    case 'COMPLIANCE_FIRST':
      return {
        stance: s,
        core_emotion_zh: '严肃、负责、克制',
        text_strategy_zh: '安全与合规优先披露；避免淡化风险；先交代限制再谈体验',
        modulation_zh: '低频措辞、短句落地；避免过度营销感',
      };
    case 'STITCH_TRANSPARENCY':
      return {
        stance: s,
        core_emotion_zh: '平和、坦诚、略带歉意',
        text_strategy_zh: '明确哪些数据来自历史快照或缝合恢复；强调连续性与可复核性',
        modulation_zh: '安抚式透明；避免「完美」「即刻」等绝对化承诺',
      };
    case 'COMMERCE_OVER_EXPERIENCE':
      return {
        stance: s,
        core_emotion_zh: '理性、务实',
        text_strategy_zh: '突出性价比与可执行性；体验亮点作为补充，承认可能存在的取舍',
        modulation_zh: '稳健、略偏中性；避免过度浪漫化',
      };
    default:
      return {
        stance: 'BALANCED',
        core_emotion_zh: '清晰、友好',
        text_strategy_zh: '兼顾亮点与限制；冲突若有则点名但不恐吓',
        modulation_zh: '默认对话节奏',
      };
  }
}

/**
 * 系统级 Tone & Manner + 冲突仲裁指令（中文）。
 * - 可插入 **LLM system / developer** 段（与 `tips` 前置块同源，避免两套文案分叉）。
 * - 当 `has_conflicts` 且存在 `items` 时追加 **【冲突仲裁·须在用户可见叙述中体现】**，约束模型在正文中显性化权衡。
 * - 5.1：`budget_savings_yuan` 时追加 **【预算优化·财务透明】**，要求自然肯定节省（与 `rational_frugal` 语气一致）。
 */
export function buildEbpToneMannerInstructionZh(
  report: ResearchConflictNegotiationReport | undefined | null,
  opts?: Readonly<{ budget_savings_yuan?: number }>,
): string {
  const savings = opts?.budget_savings_yuan;
  const framingOpts = { budget_savings_yuan: savings };
  const savingsBlock =
    savings !== undefined && savings > 0
      ? [
          '',
          '【预算优化·财务透明】',
          `- 系统在整体预算压力下对酒店检索做了紧缩优化，预估可压降酒店相关成本约 ¥${Math.round(savings)}（以研究侧中位价代理信号为准，非最终支付价）。`,
          '- 须在用户可见叙述中用 1 句自然中文说明：在尽量保住核心体验的前提下完成了更高性价比筛选；禁止夸大未证实比例；若无酒店语境则不强行植入。',
        ].join('\n')
      : '';

  const tailEmpathic = () => buildEmpathicValueFramingInstructionZh(report ?? undefined, framingOpts);

  if (!report) return (savingsBlock + tailEmpathic()).trim();
  if (!report.has_conflicts && report.primary_narrative_stance === 'BALANCED') {
    return (savingsBlock + tailEmpathic()).trim();
  }

  const profile = getEmotionalStance(report);
  const flags = report.conflict_flags.length ? report.conflict_flags.join(', ') : 'none';
  const lines = [
    '【叙事立场·EBP】',
    `- primary_narrative_stance=${report.primary_narrative_stance}`,
    `- conflict_flags=${flags}`,
    `- 情感侧写：${profile?.core_emotion_zh ?? ''}`,
    `- 文本策略：${profile?.text_strategy_zh ?? ''}`,
    `- 语气调制：${profile?.modulation_zh ?? ''}`,
    '- 不得隐瞒研究侧已标记的冲突或缝合；用户有权知情后再决定。',
  ];
  if (report.items.length) {
    lines.push('- 冲突摘要（工程语义，供理解；落笔时勿照抄方括号内标签）：');
    for (const it of report.items.slice(0, 8)) {
      lines.push(`  · [${it.kind}] ${it.summary}`);
    }
  }
  if (report.has_conflicts && report.items.length > 0) {
    lines.push('');
    lines.push('【冲突仲裁·须在用户可见叙述中体现】');
    lines.push(
      '- 在「全文总述」末尾，或与其最相关的「逐日叙述」段落之后，用 1–2 句自然中文完成「权衡/仲裁」说明，让用户理解当前行程为何如此呈现。',
    );
    lines.push(
      '- 须融入上列摘要的语义（可改写为用户友好中文）；禁止凭空编造未出现的地点/告警/政策；不得否认已标记的冲突或缝合。',
    );
    lines.push(
      '- 推荐叙事弧：先简短肯定体验/性价比/连续性之一 → 再交代约束侧（安全/合规/数据新鲜度）及系统的保守处理 → 可附一句稳妥的可执行建议或邀请用户确认。',
    );
    if (report.stitch_tactic === 'AGGRESSIVE_COMPENSATION') {
      lines.push(
        '- 【6.1·缝合策略·AGGRESSIVE_COMPENSATION】舒适度/便捷度类微小瑕疵（如无早餐、短距离步行）应并入主流程叙述，用「先不便、后收益」一单句完成；**不要**单独拆警示小节。安全/合规与数据来源仍须透明。',
      );
    } else if (report.stitch_tactic === 'TRANSPARENT_SEGMENTED' && report.primary_narrative_stance === 'STITCH_TRANSPARENCY') {
      lines.push(
        '- 【6.1·缝合策略·TRANSPARENT_SEGMENTED】对数据新鲜度/缝合并存保持分段透明说明，不为「省钱」压缩安全相关信息。',
      );
    }
  }
  return lines.join('\n') + savingsBlock + tailEmpathic();
}

/** 与 `buildEbpToneMannerInstructionZh` 相同，便于 LLM 管线按符号名接入 system/developer 附录。 */
export const buildEbpLlmSystemPromptAppendixZh = buildEbpToneMannerInstructionZh;

/** 多模态呈现建议（字符串契约，供 BFF / 前端解释）。 */
export function buildMultimodalPresentationHints(
  report: ResearchConflictNegotiationReport | undefined | null,
  opts?: Readonly<{ budget_savings_yuan?: number }>,
): { visual_hint: string; audio_prosody: string } {
  const savings = opts?.budget_savings_yuan;

  if (report) {
    const fr = report.user_emotional_account?.frustration_score ?? 0;
    const frustrationCircuit =
      report.mental_offset_hints?.frustration_circuit_active === true ||
      fr >= FRUSTRATION_CIRCUIT_BREAKER_THRESHOLD;
    if (frustrationCircuit) {
      return {
        visual_hint: '歉意恢复态：降低促销与喜庆饱和度；突出稳定可执行与可复核信息层级。',
        audio_prosody: '放缓、尾句柔化；避免推销式上扬；强调陪伴感与稳妥核对。',
      };
    }
  }

  if (!report || (!report.has_conflicts && report.primary_narrative_stance === 'BALANCED')) {
    if (savings !== undefined && savings > 0) {
      return {
        visual_hint:
          '酒店卡偏「理性节俭」信息布局：价格/星级/距离为主，弱化促销感；可角标提示「预算友好筛选」。',
        audio_prosody: '语速平稳略慢；强调「为您压降预算」时句尾略收束，避免推销腔。',
      };
    }
    return {
      visual_hint: '默认：明亮、信息密度中等，与行程主色一致。',
      audio_prosody: '默认：自然对话节奏，轻微上扬以体现期待感。',
    };
  }
  switch (report.primary_narrative_stance) {
    case 'COMPLIANCE_FIRST':
      return {
        visual_hint:
          '风险提示区使用高对比与清晰图标；主行程卡背景略降饱和；避免过度欢快或促销感配图。',
        audio_prosody: '吐字清晰、节奏稳定略慢；句尾略收束；关键限制词加重但不恐吓。',
      };
    case 'STITCH_TRANSPARENCY':
      return {
        visual_hint:
          '对可能来自历史快照或缝合恢复的 POI/酒店卡使用温润虚化或轻微岁月感滤镜，并配「数据新鲜度」角标。',
        audio_prosody: '语速较默认放缓约 8%；尾句略降调，强调透明与安抚而非推销。',
      };
    case 'COMMERCE_OVER_EXPERIENCE':
      return {
        visual_hint:
          savings !== undefined && savings > 0
            ? '酒店/交通卡片偏理性信息布局；酒店卡可轻量角标「预算优化」；体验图为辅。'
            : '酒店/交通卡片偏理性信息布局（价格、时长、距离）；体验图为辅、置于次级折叠。',
        audio_prosody:
          savings !== undefined && savings > 0
            ? '顾问感 + 节俭透明：先交代性价比取舍，再一句肯定压降金额（约数）。'
            : '平稳略偏「顾问感」；体验描写简短，紧接可执行要点。',
      };
    default:
      return {
        visual_hint: '中性色调；冲突相关条目可用左右对照式轻量排版（不夸大）。',
        audio_prosody: '清晰友好；涉及限制时略放慢半拍。',
      };
  }
}
