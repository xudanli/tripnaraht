import type { NarrationLike, NarrationVoiceToneModifier } from '../../decision/kernel/interfaces/phase-executor.interface';
import type { ResearchConflictNegotiationReport } from '../teams/research/research-conflict-negotiation.types';
import { mapVoiceToneModifierForNegotiationAndBudget } from './narrator-ebp-tone.util';
import type { EmotionalContext, EmotionalVoiceToneModifier } from '../narrator/types/emotional-context.type';

export function mapEmotionalToneToNarrationVoice(
  tone: EmotionalVoiceToneModifier,
): NarrationVoiceToneModifier | undefined {
  switch (tone) {
    case 'empathetic_reassurance':
      return 'empathetic_reassurance';
    case 'professional_authoritative':
      return 'professional_authoritative';
    case 'relaxed_buddy':
    case 'silent_observant':
    default:
      return undefined;
  }
}

export function buildEmotionalProsodyHintZh(
  emotional: EmotionalContext | undefined | null,
): string | undefined {
  if (!emotional) return undefined;
  const { pitch, speedFactor } = emotional.recommendedVoiceStance.audioProsodyPreference;
  const pct = Math.round((1 - speedFactor) * 100);
  const pitchZh = pitch === 'low' ? '偏低' : pitch === 'high' ? '略高' : '中性';
  const gateZh =
    emotional.proactivityGate === 'SILENT'
      ? '；保持静默默契，非紧急不主动打断'
      : emotional.proactivityGate === 'ACTIVE'
        ? '；优先短句、可执行指令'
        : '';
  return `情绪韵律：语速较默认${pct > 0 ? `放缓约 ${pct}%` : '持平'}，音调${pitchZh}${gateZh}。`;
}

/** 供 LLM system / tips 前置块使用的情绪矩阵指令（中文）。 */
export function buildEmotionalToneInstructionZh(
  emotional: EmotionalContext | undefined | null,
): string {
  if (!emotional) return '';

  const lines = [
    '',
    '【情绪矩阵·NARRATE】',
    `- 疲劳指数 ${(emotional.fatigueIndex * 100).toFixed(0)}/100；焦虑 ${(emotional.anxietyLevel * 100).toFixed(0)}/100${emotional.anxietyTriggered ? '（已触发共情熔断）' : ''}。`,
    `- 语气 Stance：${emotional.recommendedVoiceStance.toneModifier}；主动触达门控：${emotional.proactivityGate}。`,
  ];

  if (emotional.ambienceSignals.weatherWindLockActive) {
    lines.push('- 当前处于风暴/强风约束：安全与可执行性优先，避免促销式兴奋语气。');
  }
  if (emotional.ambienceSignals.isGoldenHour) {
    lines.push('- 黄昏窗口：可适度留白，少堆砌打卡清单。');
  }
  if (emotional.sharedMilestones.length > 0) {
    const anchor = emotional.sharedMilestones[0]!;
    lines.push(
      `- 跨行程回忆锚点：${anchor.locationName}（${anchor.legacyPreferenceToken}）；仅自然提及，禁止生硬卖惨或表功。`,
    );
  }

  const prosody = buildEmotionalProsodyHintZh(emotional);
  if (prosody) lines.push(`- ${prosody}`);

  return lines.join('\n');
}

/**
 * 将 EmotionalContext 合并进 NarrationLike（voice / prosody 与 EBP 协商结果按优先级合并）。
 */
export function applyEmotionalContextToNarration(
  narration: NarrationLike,
  emotional: EmotionalContext | undefined | null,
  ebpReport?: ResearchConflictNegotiationReport | null,
  researchData?: Record<string, unknown>,
): NarrationLike {
  if (!emotional) return narration;

  const emotionalVoice = mapEmotionalToneToNarrationVoice(
    emotional.recommendedVoiceStance.toneModifier,
  );
  const ebpVoice = mapVoiceToneModifierForNegotiationAndBudget(ebpReport ?? undefined, researchData);
  const curVoice = narration.voice_tone_modifier;

  let voice_tone_modifier = curVoice;
  if (emotionalVoice === 'professional_authoritative') {
    voice_tone_modifier = 'professional_authoritative';
  } else if (ebpVoice === 'empathetic_reassurance') {
    voice_tone_modifier = 'empathetic_reassurance';
  } else if (emotionalVoice === 'empathetic_reassurance') {
    voice_tone_modifier = 'empathetic_reassurance';
  } else if (
    ebpVoice !== undefined &&
    (curVoice === undefined || curVoice === 'neutral' || emotionalVoice === undefined)
  ) {
    voice_tone_modifier = ebpVoice;
  } else if (emotionalVoice !== undefined) {
    voice_tone_modifier = emotionalVoice;
  }

  const emotionalProsody = buildEmotionalProsodyHintZh(emotional);
  const audio_prosody = emotionalProsody
    ? narration.audio_prosody
      ? `${narration.audio_prosody} ${emotionalProsody}`
      : emotionalProsody
    : narration.audio_prosody;

  return {
    ...narration,
    ...(voice_tone_modifier !== undefined ? { voice_tone_modifier } : {}),
    ...(audio_prosody !== undefined ? { audio_prosody } : {}),
  };
}
