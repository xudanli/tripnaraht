import type { ConstraintReport } from '../../../decision/kernel/decision-state.types';
import type { NarrationLike } from '../../../decision/kernel/interfaces/phase-executor.interface';
import type {
  IntentionalSlackReasonCode,
  IntentionalSlackSlot,
  OpenWorldPoiStub,
} from '../../../planning-policy/types/open-world-poi.types';

function slackReasonLabel(code: IntentionalSlackReasonCode): string {
  switch (code) {
    case 'WEATHER_WINDOW':
      return '天气窗';
    case 'SAFETY_BUFFER':
      return '安全缓冲';
    case 'VERIFICATION_PENDING':
      return '待核实活动';
    case 'EXPEDITION_FLEX':
      return '远征弹性';
    default:
      return '弹性时段';
  }
}

function buildSlackNarrationLine(slack: IntentionalSlackSlot): string {
  const dayPart = slack.day != null ? `第 ${slack.day} 天` : slack.date ? slack.date : '今日';
  const hours = Math.round(slack.minutesReserved / 60);
  const label = slackReasonLabel(slack.reasonCode);
  if (slack.narrationHint?.trim()) return slack.narrationHint.trim();
  return `[Dr.Dre] ${dayPart}为您预留约 ${hours} 小时${label}——不必赶场，等条件成熟再出发。`;
}

function buildStubVerificationLine(stub: OpenWorldPoiStub): string {
  const tags = stub.constraintTags.join('、');
  return `[Abu] 「${stub.displayName}」尚未在地图库核实（${tags}）；已作为弹性占位纳入方案，出发前请确认向导/许可。`;
}

export function mergeDecisionContextIntoNarration(
  narration: NarrationLike,
  constraints: ConstraintReport | undefined,
): NarrationLike {
  const ctx = constraints?.decisionContext;
  if (!ctx) return narration;

  const tips = [...(narration.tips ?? [])];
  const warnings = [...(narration.warnings ?? [])];

  if (ctx.sparseProfileId) {
    const sparseIntro =
      '[Dr.Dre] 这是稀疏极地行程：留白不是缺口，而是为天气窗和安全边界刻意保留的弹性。';
    if (!tips.some((t) => t.includes('稀疏极地') || t.includes('留白不是缺口'))) {
      tips.unshift(sparseIntro);
    }
  }

  for (const slack of ctx.intentionalSlack ?? []) {
    const line = buildSlackNarrationLine(slack);
    if (!tips.includes(line)) tips.push(line);
  }

  for (const stub of ctx.openWorldStubs ?? []) {
    if (stub.status !== 'verification_pending' && stub.source !== 'user_mention') continue;
    const line = buildStubVerificationLine(stub);
    if (!warnings.some((w) => typeof w === 'string' && w.includes(stub.displayName))) {
      warnings.push(line);
    }
  }

  return {
    ...narration,
    tips,
    warnings,
    decision_context_summary: {
      sparse_profile_id: ctx.sparseProfileId,
      intentional_slack_count: ctx.intentionalSlack?.length ?? 0,
      open_world_stub_count: ctx.openWorldStubs?.length ?? 0,
      mention_count: ctx.openWorldMentions?.length ?? 0,
    },
  };
}
