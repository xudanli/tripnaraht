import type { EmotionalContext } from '../narrator/types/emotional-context.type';
import type { NarrationLike } from '../../decision/kernel/interfaces/phase-executor.interface';

export interface AnchoringPresenceOptions {
  /** kernel escalation 用户可见片段（若有则并入第 3 步） */
  escalationSnippet?: string;
  /** 是否已触发风暴/强风锁死 */
  weatherWindLockActive?: boolean;
  /** 是否已同步离线地图（叙事承诺，须与后端事实一致） */
  offlineMapsSynced?: boolean;
}

/**
 * P3：精神主心骨 — 确定性三步式锚定叙事（仅在 emergency / 焦虑熔断时注入）。
 */
export function buildAnchoringPresenceBlockZh(
  emotional: EmotionalContext,
  opts?: AnchoringPresenceOptions,
): string | undefined {
  const anchoringMode =
    emotional.recommendedVoiceStance.toneModifier === 'professional_authoritative' ||
    emotional.anxietyTriggered;

  if (!anchoringMode) return undefined;

  const step3Parts = ['后续可变约项已标记为可延期处理，不会产生无谓罚款。'];
  if (opts?.offlineMapsSynced) {
    step3Parts.unshift('离线地图与关键凭证已同步到你的设备。');
  }
  if (opts?.escalationSnippet?.trim()) {
    step3Parts.unshift(opts.escalationSnippet.trim());
  }
  if (opts?.weatherWindLockActive || emotional.ambienceSignals.weatherWindLockActive) {
    step3Parts.unshift('风暴/强风约束下，系统已切换至安全备选动线。');
  }

  return [
    '【锚定·有我在】',
    '别慌，有我在。',
    '现在听我指挥，做三件事：',
    '1. 待在原地别动，系统已锁定你的行程与位置上下文；',
    '2. 如需支援，请使用 App 内一键应急入口或联系当地紧急电话；',
    `3. ${step3Parts.join(' ')}`,
    '你现在是安全的。',
  ].join('\n');
}

export function mergeAnchoringPresenceIntoNarration(
  narration: NarrationLike,
  emotional: EmotionalContext | undefined | null,
  opts?: AnchoringPresenceOptions,
): NarrationLike {
  if (!emotional) return narration;
  const block = buildAnchoringPresenceBlockZh(emotional, opts);
  if (!block) return narration;

  const tips = [...(narration.tips ?? [])];
  if (!tips.some((t) => t.includes('【锚定·有我在】'))) {
    tips.unshift(block);
  }

  const summaryPrefix = '别慌，有我在。';
  const user_friendly_summary = narration.user_friendly_summary?.includes(summaryPrefix)
    ? narration.user_friendly_summary
    : `${summaryPrefix} ${narration.user_friendly_summary ?? ''}`.trim();

  return {
    ...narration,
    tips,
    user_friendly_summary,
    voice_tone_modifier: 'professional_authoritative',
  };
}
