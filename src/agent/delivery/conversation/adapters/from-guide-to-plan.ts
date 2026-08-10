import type {
  ConversationActionV1,
  ImportPreviewCardV1,
} from '../conversation-turn-result.types';

export type GuideToPlanAssembleSource = {
  /** Phase 6：session 摘要；Phase 1 可空 → stub */
  session_id?: string | null;
  status?: ImportPreviewCardV1['status'];
  summary_zh?: string | null;
  matched_day_iso?: string;
  conflicts_zh?: string[];
  missing_zh?: string[];
  source_hint?: string;
  /** 用户消息暗示上传/链接，但尚未接入 G2P */
  import_intent_hint?: boolean;
};

/**
 * Guide-to-Plan → import_preview。
 * Phase 1–5：无 session 时仅在 import_intent_hint 时出 stub 卡。
 */
export function adaptImportPreviewFromGuideToPlan(
  src: GuideToPlanAssembleSource,
): { card: ImportPreviewCardV1; actions: ConversationActionV1[] } | null {
  if (src.session_id) {
    const card: ImportPreviewCardV1 = {
      kind: 'import_preview',
      title_zh: '导入预览',
      status: src.status ?? 'parsed',
      summary_zh: String(src.summary_zh ?? '已解析外部内容，请确认后写入行程。').trim(),
      ...(src.matched_day_iso
        ? { matched_day_iso: src.matched_day_iso.slice(0, 10) }
        : {}),
      ...(src.conflicts_zh?.length ? { conflicts_zh: src.conflicts_zh } : {}),
      ...(src.missing_zh?.length ? { missing_zh: src.missing_zh } : {}),
      guide_to_plan_session_id: src.session_id,
      ...(src.source_hint ? { source_hint: src.source_hint } : {}),
    };
    const actions: ConversationActionV1[] = [
      {
        id: 'open_guide_to_plan',
        kind: 'open_guide_to_plan',
        label_zh: '打开导入确认',
        payload: { session_id: src.session_id },
      },
    ];
    return { card, actions };
  }

  if (src.import_intent_hint) {
    return {
      card: {
        kind: 'import_preview',
        title_zh: '外部内容导入',
        status: 'stub',
        summary_zh:
          String(src.summary_zh ?? '').trim() ||
          '已识别导入意图。请通过 Guide-to-Plan 完成解析与确认写入（对话入口适配进行中）。',
        ...(src.source_hint ? { source_hint: src.source_hint } : {}),
      },
      actions: [
        {
          id: 'open_guide_to_plan',
          kind: 'open_guide_to_plan',
          label_zh: '前往导入',
          payload: { route: 'guide_to_plan' },
        },
      ],
    };
  }

  return null;
}
