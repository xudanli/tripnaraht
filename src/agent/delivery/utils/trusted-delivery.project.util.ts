import type { AgentRunTraceV1 } from '../../orchestration/agent-run-trace.util';
import type { FlawedDraftDescriptorV1 } from '../types/flawed-draft-v1.type';
import { resolveDeliveryVerdict } from '../types/delivery-verdict.types';
import type { TrustedDeliveryV1 } from '../types/trusted-delivery-v1.type';
import {
  PUBLIC_PHASE_LABEL_ZH,
  TRUSTED_DELIVERY_SCHEMA_ID,
  mapInternalStepToPublicPhase,
} from '../trusted-delivery.constants';

function fallbackReasonZh(reason: string | undefined): string {
  switch (reason) {
    case 'flag_off':
      return '系统使用了备用规划路径（开关关闭）';
    case 'gray_miss':
      return '系统使用了备用规划路径（灰度未命中）';
    case 'missing_kernel':
    case 'missing_dso':
      return '核心决策服务暂不可用，已降级处理';
    case 'empty_narrative':
      return '行程说明由备用叙述器生成';
    case 'scoped_partial_degraded_to_full':
      return '局部调研信息不完整，已扩大调研范围';
    case 'r2r_forced_full_empty_prior':
      return '缺少既有调研结果，已重新完整调研';
    default:
      return '部分能力已降级处理';
  }
}

export function projectTrustedDeliveryV1(input: {
  currentStep?: string;
  resultStatus?: string;
  progressPercent?: number;
  progressMessage?: string;
  agentRunTrace?: AgentRunTraceV1;
  flawedDraft?: FlawedDraftDescriptorV1;
  clarificationCount?: number;
  /** 非 flawed 的软警告（如 SOFT gate），投影为 VERIFIED_WITH_WARNINGS */
  hasSoftWarnings?: boolean;
}): TrustedDeliveryV1 {
  const phase = mapInternalStepToPublicPhase(input.currentStep);
  const status = String(input.resultStatus ?? '').toUpperCase();

  const user_confirm = {
    required:
      status === 'NEED_CONFIRMATION' ||
      status === 'NEED_MORE_INFO' ||
      status === 'NEED_CONSENT' ||
      input.flawedDraft?.is_flawed === true ||
      (input.clarificationCount ?? 0) > 0,
    kind:
      status === 'NEED_CONSENT'
        ? ('consent' as const)
        : status === 'NEED_CONFIRMATION'
          ? ('confirmation' as const)
          : status === 'NEED_MORE_INFO' || (input.clarificationCount ?? 0) > 0
            ? ('clarification' as const)
            : undefined,
    summary_zh:
      status === 'NEED_CONFIRMATION'
        ? '需要您确认后才能继续'
        : status === 'NEED_MORE_INFO'
          ? '请补充信息以便继续规划'
          : undefined,
  };

  const fallbacks = input.agentRunTrace?.fallbacks ?? [];
  const degraded_explanation = {
    present: fallbacks.length > 0,
    summary_zh: fallbacks.length > 0 ? '本次运行存在降级处理' : undefined,
    reasons_zh: fallbacks.length
      ? [...new Set(fallbacks.map((f) => fallbackReasonZh(f.reason)))]
      : undefined,
  };

  const flawed = input.flawedDraft;
  const flawed_disclosure = {
    present: flawed?.is_flawed === true,
    headline_zh: flawed?.headline_zh,
    reason_codes: flawed?.reasons?.map((r) => r.code),
  };

  const ai_operation_log = (input.agentRunTrace?.nodes ?? [])
    .filter((n) => n.step)
    .map((n) => {
      const p = mapInternalStepToPublicPhase(n.step);
      return {
        label_zh: PUBLIC_PHASE_LABEL_ZH[p],
        summary: n.outputs_summary?.slice(0, 160),
        duration_ms: n.duration_ms,
      };
    })
    // 折叠连续相同公开标签
    .reduce<TrustedDeliveryV1['ai_operation_log']>((acc, cur) => {
      const last = acc[acc.length - 1];
      if (last && last.label_zh === cur.label_zh) {
        last.duration_ms = (last.duration_ms ?? 0) + (cur.duration_ms ?? 0);
        if (cur.summary) last.summary = cur.summary;
        return acc;
      }
      acc.push(cur);
      return acc;
    }, []);

  const delivery_verdict = resolveDeliveryVerdict({
    resultStatus: input.resultStatus,
    flawedDraft: input.flawedDraft,
    hasSoftWarnings: input.hasSoftWarnings === true,
  });

  // FLAWED_DRAFT：强制确认意图，默认不进入静默 Confirm/Apply
  if (delivery_verdict === 'FLAWED_DRAFT') {
    user_confirm.required = true;
    user_confirm.kind = user_confirm.kind ?? 'confirmation';
    user_confirm.summary_zh =
      user_confirm.summary_zh ?? '当前为瑕疵草案，请确认风险后再继续';
  }

  return {
    schemaId: TRUSTED_DELIVERY_SCHEMA_ID,
    version: 1,
    delivery_verdict,
    task_progress: {
      phase,
      label_zh: PUBLIC_PHASE_LABEL_ZH[phase],
      percent: input.progressPercent,
      message: input.progressMessage,
    },
    user_confirm,
    degraded_explanation,
    flawed_disclosure,
    ai_operation_log,
  };
}
